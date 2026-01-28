import { useState, useMemo, useEffect } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useSupabaseData } from './hooks/useSupabaseData';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import Login from './components/Login';
import {
    LayoutDashboard,
    Target,
    Settings as SettingsIcon,
    Plus,
    Bell
} from 'lucide-react';
import { Wallet } from 'lucide-react';
import { Transaction, Goal, Subscription, Budget, SummaryStats, TimelineItem, SettingsState, CreditCard, Notification } from './types';

import { formatCurrency, formatMonthYear, formatDateTitle } from './utils/formatters';
import { Ozet } from './pages/Ozet';
import { Analiz } from './pages/Analiz';
import { Hedefler } from './pages/Hedefler';
import { Cuzdan } from './pages/Cuzdan';
import { Settings } from './pages/Settings';
import { IslemEkleModal } from './components/IslemEkleModal';
import { HedefEkleModal } from './components/HedefEkleModal';
import { AbonelikEkleModal } from './components/AbonelikEkleModal';
import { ParaEkleModal } from './components/ParaEkleModal';
import { OnayModal } from './components/OnayModal';
import { ButceEkleModal } from './components/ButceEkleModal';
import { BildirimlerModal } from './components/BildirimlerModal';
export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useSupabaseData<Transaction>('transactions', []);
    const [goals, setGoals] = useSupabaseData<Goal>('goals', []);
    const [subscriptions, setSubscriptions] = useSupabaseData<Subscription>('subscriptions', []);
    const [budgets, setBudgets] = useSupabaseData<Budget>('budgets', []);
    const [creditCards, setCreditCards] = useSupabaseData<CreditCard>('credit_cards', []);
    const [notifications, setNotifications] = useSupabaseData<Notification>('notifications', []);

    // const [transactions, setTransactions] = useState(INITIAL_DATA);
    // const [goals, setGoals] = useState(INITIAL_GOALS);
    // const [subscriptions, setSubscriptions] = useState(INITIAL_SUBSCRIPTIONS);
    // const [budgets, setBudgets] = useState(INITIAL_BUDGETS);
    // const [creditCards, setCreditCards] = useState(INITIAL_CREDIT_CARDS);
    // const [notifications, setNotifications] = useState<Notification[]>([]);
    const [settings, setSettings] = useLocalStorage<SettingsState>('settings', {
        profile: {
            name: 'User',
            email: '',
            avatar: '👤'
        },
        preferences: {
            currency: 'TRY',
            theme: 'light'
        },
        notifications: {
            email: false,
            budgetAlerts: true,
            goalReminders: true
        }
    });
    const [activeTab, setActiveTab] = useState<'home' | 'goals' | 'stats' | 'settings' | 'cards' | 'subs'>('home');
    const [activePage, setActivePage] = useState<'main' | 'help' | 'privacy' | 'terms'>('main');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBildirimlerModalOpen, setIsBildirimlerModalOpen] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');

    // GOALS STATE
    const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
    const [isSubsModalOpen, setIsSubsModalOpen] = useState(false);
    const [isAddMoneyModalOpen, setIsAddMoneyModalOpen] = useState(false);
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
    const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

    // SETTINGS STATE
    // DATE STATE
    const [currentDate, setCurrentDate] = useState(new Date());

    // Generate Notifications Logic
    useEffect(() => {
        const newAlerts: Notification[] = [];
        const now = new Date();

        // 1. Budget Alerts
        budgets.forEach(budget => {
            const spent = transactions
                .filter(t => t.category === budget.category && t.type === 'expense' && new Date(t.date).getMonth() === now.getMonth())
                .reduce((acc, curr) => acc + curr.amount, 0);

            const ratio = spent / budget.limitAmount;
            if (ratio >= 1) {
                newAlerts.push({
                    id: `budget-exceeded-${budget.id}-${now.getMonth()}`,
                    title: 'Bütçe Aşıldı!',
                    message: `${budget.category} bütçeniz limiti aştı (${formatCurrencyWithSettings(spent)})`,
                    type: 'budget',
                    date: now.toISOString(),
                    isRead: false,
                    priority: 'high'
                });
            } else if (ratio >= 0.8) {
                newAlerts.push({
                    id: `budget-warning-${budget.id}-${now.getMonth()}`,
                    title: 'Bütçe Sınırda',
                    message: `${budget.category} bütçenizin %80'ine ulaştınız.`,
                    type: 'budget',
                    date: now.toISOString(),
                    isRead: false,
                    priority: 'medium'
                });
            }
        });

        // 2. Goal Progress
        goals.forEach(goal => {
            const ratio = goal.currentAmount / goal.targetAmount;
            if (ratio >= 1) {
                newAlerts.push({
                    id: `goal-reached-${goal.id}`,
                    title: 'Hedefe Ulaşıldı! 🎉',
                    message: `${goal.title} hedefiniz tamamlandı. Tebrikler!`,
                    type: 'goal',
                    date: now.toISOString(),
                    isRead: false,
                    priority: 'high'
                });
            }
        });

        // 3. Credit Card Payment
        creditCards.forEach(card => {
            const paymentDate = new Date(now.getFullYear(), now.getMonth(), card.paymentDueDay);
            const diffDays = Math.ceil((paymentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= 3) {
                newAlerts.push({
                    id: `card-payment-${card.id}-${now.getMonth()}`,
                    title: 'Kart Ödeme Hatırlatıcı',
                    message: `${card.name} son ödeme tarihine ${diffDays === 0 ? 'bugün' : diffDays + ' gün'} kaldı.`,
                    type: 'card',
                    date: now.toISOString(),
                    isRead: false,
                    priority: diffDays === 0 ? 'high' : 'medium'
                });
            }
        });

        // Merge with existing notifications (avoid duplicates by ID)
        setNotifications(prev => {
            const existingIds = new Set(prev.map(n => n.id));
            const uniqueNew = newAlerts.filter(a => !existingIds.has(a.id));
            if (uniqueNew.length === 0) return prev;
            return [...uniqueNew, ...prev];
        });
    }, [transactions, budgets, goals, creditCards]); // Trigger when data changes

    const handleMarkAsRead = (id: string) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    };

    const handleDeleteNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    const handleClearNotifications = () => {
        setNotifications([]);
    };

    // Check user session
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Apply theme to document
    useMemo(() => {
        if (settings.preferences.theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [settings.preferences.theme]);

    // Helper to change months
    const changeMonth = (direction: 'prev' | 'next') => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            if (direction === 'prev') newDate.setMonth(prev.getMonth() - 1);
            else newDate.setMonth(prev.getMonth() + 1);
            return newDate;
        });
    };

    // Filter transactions by selected month/year
    const monthlyTransactions = useMemo(() => {
        return transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate.getMonth() === currentDate.getMonth() &&
                tDate.getFullYear() === currentDate.getFullYear();
        });
    }, [transactions, currentDate]);

    const stats: SummaryStats = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

        const currentBalance = transactions
            .filter(t => t.status === 'completed' && new Date(t.date) <= endOfMonth)
            .reduce((acc, curr) => {
                return curr.type === 'income' ? acc + curr.amount : acc - curr.amount;
            }, 0);

        const projectedBalance = transactions
            .filter(t => new Date(t.date) <= endOfMonth)
            .reduce((acc, curr) => {
                return curr.type === 'income' ? acc + curr.amount : acc - curr.amount;
            }, 0);

        const { monthlyIncome, monthlyExpense } = monthlyTransactions.reduce((acc, curr) => {
            if (curr.type === 'income') {
                acc.monthlyIncome += curr.amount;
            } else {
                acc.monthlyExpense += curr.amount;
            }
            return acc;
        }, { monthlyIncome: 0, monthlyExpense: 0 });

        return {
            totalBalance: currentBalance,
            projectedBalance: projectedBalance,
            monthlyIncome,
            monthlyExpense
        };
    }, [transactions, monthlyTransactions, currentDate]);

    // Timeline Logic
    const timelineItems = useMemo<TimelineItem[]>(() => {
        const groups: Record<string, Transaction[]> = {};
        const events: Record<string, any[]> = {};
        const filtered = monthlyTransactions.filter(t => filter === 'all' || t.type === filter);

        filtered.forEach(t => {
            if (!groups[t.date]) groups[t.date] = [];
            groups[t.date].push(t);
        });

        // Add Credit Card Events
        creditCards.forEach(card => {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            // Cutoff Event
            const cutoffDate = new Date(year, month, card.cutoffDay);
            if (cutoffDate.getMonth() === month) {
                const dateStr = cutoffDate.toISOString().split('T')[0];
                if (!events[dateStr]) events[dateStr] = [];
                events[dateStr].push({
                    type: 'event',
                    date: dateStr,
                    eventType: 'cutoff',
                    cardId: card.id,
                    cardName: card.name,
                    color: card.color
                });
            }

            // Payment Event
            const paymentDate = new Date(year, month, card.paymentDueDay);
            if (paymentDate.getMonth() === month) {
                const dateStr = paymentDate.toISOString().split('T')[0];
                if (!events[dateStr]) events[dateStr] = [];
                events[dateStr].push({
                    type: 'event',
                    date: dateStr,
                    eventType: 'payment',
                    cardId: card.id,
                    cardName: card.name,
                    color: card.color,
                    amount: card.currentDebt // Current debt as reference
                });
            }
        });

        // Determine First and Last Day of current month
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const startDay = new Date(year, month, 1);
        const endDay = new Date(year, month + 1, 0);

        // Helper to format date as YYYY-MM-DD locally
        const formatLocal = (date: Date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const startStr = formatLocal(startDay);
        const endStr = formatLocal(endDay);

        const allDates = new Set([...Object.keys(groups), ...Object.keys(events)]);
        allDates.add(startStr);
        allDates.add(endStr);

        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        const items: TimelineItem[] = [];

        for (let i = 0; i < sortedDates.length; i++) {
            const currentDateStr = sortedDates[i];

            // Add Events for this day
            if (events[currentDateStr]) {
                events[currentDateStr].forEach(ev => items.push(ev));
            }

            // Add Transactions for this day
            const txs = groups[currentDateStr];
            if (txs && txs.length > 0) {
                items.push({ type: 'data', date: currentDateStr, transactions: txs });
            } else if (!events[currentDateStr]) {
                // Only add "empty" if there are no events AND no txs (unless it's boundary which we added)
                items.push({ type: 'empty', date: currentDateStr });
            }

            if (i < sortedDates.length - 1) {
                const nextDate = sortedDates[i + 1];
                const currentObj = new Date(currentDateStr);
                const nextObj = new Date(nextDate);

                if (isNaN(currentObj.getTime()) || isNaN(nextObj.getTime())) continue;

                const diffTime = Math.abs(nextObj.getTime() - currentObj.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) - 1;

                if (diffDays >= 4) {
                    const firstEmpty = new Date(currentObj);
                    firstEmpty.setDate(firstEmpty.getDate() + 1);
                    items.push({ type: 'empty', date: firstEmpty.toISOString().split('T')[0] });
                    items.push({ type: 'summary', count: diffDays - 2 });
                    const lastEmpty = new Date(currentObj);
                    lastEmpty.setDate(lastEmpty.getDate() + diffDays);
                    items.push({ type: 'empty', date: lastEmpty.toISOString().split('T')[0] });
                } else if (diffDays > 0) {
                    for (let j = 1; j <= diffDays; j++) {
                        const emptyDate = new Date(currentObj);
                        emptyDate.setDate(emptyDate.getDate() + j);
                        try {
                            items.push({ type: 'empty', date: emptyDate.toISOString().split('T')[0] });
                        } catch { continue; }
                    }
                }
            }
        }
        return items;
    }, [monthlyTransactions, filter, currentDate, creditCards]);

    // CREDIT CARD HANDLERS
    const handleAddCard = (newCard: CreditCard) => {
        setCreditCards(prev => [...prev, newCard]);
    };

    const handleDeleteCard = (id: string) => {
        if (confirm('Bu kredi kartını silmek istediğinize emin misiniz?')) {
            setCreditCards(prev => prev.filter(c => c.id !== id));
        }
    };

    const handleAddTransaction = (newTransaction: Transaction) => {
        setTransactions(prev => [...prev, newTransaction]);

        // If credit card spending, update card debt
        if (newTransaction.paymentMethod === 'credit_card' && newTransaction.creditCardId && newTransaction.type === 'expense') {
            setCreditCards(prev => prev.map(card =>
                card.id === newTransaction.creditCardId
                    ? { ...card, currentDebt: card.currentDebt + newTransaction.amount }
                    : card
            ));
        }

        setIsModalOpen(false);
    };

    const handleFinalDelete = () => {
        if (confirmDeleteId) {
            setTransactions(prev => prev.filter(t => t.id !== confirmDeleteId));
            setConfirmDeleteId(null);
        }
    };

    // GOAL HANDLERS
    const handleAddGoal = (newGoal: Goal) => {
        setGoals(prev => [...prev, newGoal]);
        setIsGoalModalOpen(false);
    };

    const handleAddMoney = (amount: number) => {
        if (!selectedGoalId) return;
        setGoals(prev => prev.map(goal =>
            goal.id === selectedGoalId
                ? { ...goal, currentAmount: goal.currentAmount + amount }
                : goal
        ));
        setIsAddMoneyModalOpen(false);
        setSelectedGoalId(null);
    };

    const openAddMoneyModal = (goalId: string) => {
        setSelectedGoalId(goalId);
        setIsAddMoneyModalOpen(true);
    };

    // SUBSCRIPTION HANDLERS
    const handleAddSubscription = (newSub: Subscription) => {
        setSubscriptions(prev => [...prev, newSub]);
        setIsSubsModalOpen(false);
    };

    const handleDeleteSubscription = (id: string) => {
        setSubscriptions(prev => prev.filter(s => s.id !== id));
    };

    const handleToggleSubscription = (id: string) => {
        setSubscriptions(prev => prev.map(s =>
            s.id === id ? { ...s, isActive: !s.isActive } : s
        ));
    };

    const formatCurrencyWithSettings = (amount: number) => {
        return formatCurrency(amount, settings.preferences.currency);
    };

    const handleProcessSubscriptions = () => {
        if (!confirm('Aktif abonelikler bu ayın giderlerine eklensin mi?')) return;
        const newTransactions: Transaction[] = subscriptions
            .filter(sub => sub.isActive)
            .map((sub, index) => {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
                const day = Math.min(sub.paymentDay, lastDayOfMonth);
                const dateObj = new Date(year, month, day);
                const offset = dateObj.getTimezoneOffset();
                const adjustedDate = new Date(dateObj.getTime() - (offset * 60 * 1000));

                return {
                    id: `sub-${Date.now()}-${index}`,
                    title: sub.title,
                    amount: sub.amount,
                    type: 'expense' as const,
                    category: sub.category,
                    date: adjustedDate.toISOString().split('T')[0],
                    status: 'pending' as const
                };
            });
        setTransactions(prev => [...prev, ...newTransactions]);
        setActiveTab('home');
    };

    const handleToggleStatus = (id: string) => {
        setTransactions(prev => prev.map(t =>
            t.id === id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t
        ));
    };

    // BUDGET HANDLERS
    const handleAddBudget = (newBudget: Budget) => {
        setBudgets(prev => [...prev, newBudget]);
        setIsBudgetModalOpen(false);
    };

    const handleDeleteBudget = (id: string) => {
        if (confirm('Bu bütçe limitini silmek istediğinize emin misiniz?')) {
            setBudgets(prev => prev.filter(b => b.id !== id));
        }
    };

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Error signing out:', error.message);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-lg">Yukleniyor...</div>
            </div>
        );
    }

    if (!session) {
        return <Login />;
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans antialiased text-slate-900 overflow-hidden">
            <div className="w-full max-w-[414px] h-screen bg-slate-50 overflow-hidden relative flex flex-col">

                {/* Header */}
                <header className="bg-white px-5 pt-7 pb-2.5 flex items-center justify-between sticky top-0 z-30 border-b border-slate-100 shadow-sm">
                    <div className="flex flex-col">
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-0.5">
                            {activeTab === 'stats' ? 'Analiz' : activeTab === 'goals' ? 'Planlama' : activeTab === 'settings' ? 'Ayarlar' : activeTab === 'subs' ? 'Abonelikler' : activeTab === 'cards' ? 'Cüzdan' : 'Cüzdanım'}
                        </p>
                        <h1 className="text-sm font-bold text-slate-900 leading-tight">
                            {activeTab === 'stats' ? formatMonthYear(currentDate) : activeTab === 'goals' ? 'Hedef & Bütçe' : activeTab === 'subs' ? `${subscriptions.length} Aktif` : activeTab === 'cards' ? `${creditCards.length} Kart & ${subscriptions.length} Abonelik` : activeTab === 'settings' ? settings.profile.name : 'Buğra G.'}
                        </h1>
                    </div>
                    <button
                        onClick={() => setIsBildirimlerModalOpen(true)}
                        className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 border border-slate-100 relative active:scale-90 transition-transform"
                    >
                        <Bell className="w-4 h-4" />
                        {notifications.some(n => !n.isRead) && (
                            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full border border-white"></span>
                        )}
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto pb-20 scroll-smooth bg-slate-50">
                    {activeTab === 'stats' ? (
                        <Analiz
                            stats={stats}
                            monthlyTransactions={monthlyTransactions}
                            budgets={budgets} // Already passed in previous code, needed here
                            currentDate={currentDate}
                            changeMonth={changeMonth}
                            formatCurrency={formatCurrencyWithSettings}
                            formatMonthYear={formatMonthYear}
                        />
                    ) : activeTab === 'goals' ? (
                        <Hedefler
                            goals={goals}
                            budgets={budgets}
                            openAddMoneyModal={openAddMoneyModal}
                            setIsGoalModalOpen={setIsGoalModalOpen}
                            onOpenAddBudgetModal={() => setIsBudgetModalOpen(true)}
                            onDeleteBudget={handleDeleteBudget}
                            formatCurrency={formatCurrencyWithSettings}
                        />
                    ) : activeTab === 'cards' ? (
                        <Cuzdan
                            cards={creditCards}
                            transactions={transactions}
                            subscriptions={subscriptions}
                            onAddCard={handleAddCard}
                            onDeleteCard={handleDeleteCard}
                            onDeleteSubscription={handleDeleteSubscription}
                            onToggleSubscription={handleToggleSubscription}
                            onOpenAddSubscriptionModal={() => setIsSubsModalOpen(true)}
                            onProcessSubscriptionsToTransactions={handleProcessSubscriptions}
                            formatCurrency={formatCurrencyWithSettings}
                        />
                    ) : activeTab === 'settings' ? (
                        <Settings
                            settings={settings}
                            setSettings={setSettings}
                            activePage={activePage}
                            setActivePage={setActivePage}
                            onLogout={handleLogout}
                        />
                    ) : (
                        <Ozet
                            stats={stats}
                            timelineItems={timelineItems}
                            currentDate={currentDate}
                            changeMonth={changeMonth}
                            filter={filter}
                            setFilter={setFilter}
                            setConfirmDeleteId={setConfirmDeleteId}
                            onToggleStatus={handleToggleStatus}
                            formatCurrency={formatCurrencyWithSettings}
                            formatDateTitle={formatDateTitle}
                            formatMonthYear={formatMonthYear}
                            goToAnalysis={() => setActiveTab('stats')}
                            transactions={transactions}
                        />
                    )}
                </main>

                {/* Bottom Nav */}
                {/* Bottom Nav */}
                <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 pt-3 pb-5 flex justify-between items-center z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.04)]">
                    <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'home' ? 'text-slate-900 scale-105' : 'text-slate-300 hover:text-slate-400'}`}>
                        <LayoutDashboard className="w-5 h-5" />
                        <span className="text-[7px] font-black uppercase tracking-widest">Özet</span>
                    </button>
                    <button onClick={() => setActiveTab('cards')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'cards' ? 'text-slate-900 scale-105' : 'text-slate-300 hover:text-slate-400'}`}>
                        <Wallet className="w-5 h-5" />
                        <span className="text-[7px] font-black uppercase tracking-widest">Cüzdan</span>
                    </button>

                    <div className="-mt-12">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-[0_8px_25px_rgba(0,0,0,0.25)] active:scale-90 transition-all border-[4px] border-slate-50"
                        >
                            <Plus className="w-6 h-6" />
                        </button>
                    </div>

                    <button onClick={() => setActiveTab('goals')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'goals' ? 'text-slate-900 scale-105' : 'text-slate-300 hover:text-slate-400'}`}>
                        <Target className="w-5 h-5" />
                        <span className="text-[7px] font-black uppercase tracking-widest">Planlama</span>
                    </button>
                    <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-slate-900 scale-105' : 'text-slate-300 hover:text-slate-400'}`}>
                        <SettingsIcon className="w-5 h-5" />
                        <span className="text-[7px] font-black uppercase tracking-widest">Ayar</span>
                    </button>
                </nav>

                {/* Modals */}
                <IslemEkleModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onAdd={handleAddTransaction}
                    creditCards={creditCards}
                />

                <HedefEkleModal
                    isOpen={isGoalModalOpen}
                    onClose={() => setIsGoalModalOpen(false)}
                    onAdd={handleAddGoal}
                />

                <AbonelikEkleModal
                    isOpen={isSubsModalOpen}
                    onClose={() => setIsSubsModalOpen(false)}
                    onAdd={handleAddSubscription}
                />

                <ParaEkleModal
                    isOpen={isAddMoneyModalOpen}
                    onClose={() => setIsAddMoneyModalOpen(false)}
                    onAdd={handleAddMoney}
                    goal={goals.find(g => g.id === selectedGoalId)}
                    formatCurrency={formatCurrencyWithSettings}
                />

                <ButceEkleModal
                    isOpen={isBudgetModalOpen}
                    onClose={() => setIsBudgetModalOpen(false)}
                    onAdd={handleAddBudget}
                />

                <OnayModal
                    isOpen={!!confirmDeleteId}
                    onClose={() => setConfirmDeleteId(null)}
                    onConfirm={handleFinalDelete}
                />

                <BildirimlerModal
                    isOpen={isBildirimlerModalOpen}
                    onClose={() => setIsBildirimlerModalOpen(false)}
                    notifications={notifications}
                    onMarkAsRead={handleMarkAsRead}
                    onDelete={handleDeleteNotification}
                    onClearAll={handleClearNotifications}
                />
            </div>
        </div>
    );
}
