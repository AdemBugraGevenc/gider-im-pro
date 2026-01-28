import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

export function useSupabaseData<T>(
    tableName: string,
    initialValue: T[] = []
): [T[], (value: T[] | ((val: T[]) => T[])) => void, boolean] {
    const [data, setData] = useState<T[]>(initialValue);
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<Session | null>(null);

    // Session kontrolu
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Fetch data on mount
    useEffect(() => {
        if (!session) {
            setLoading(false);
            return;
        }

        fetchData();

        // Realtime subscription
        const channel = supabase
            .channel(`${tableName}_changes`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: tableName,
                    filter: `user_id=eq.${session.user.id}`
                },
                () => {
                    fetchData(); // Refetch on any change
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [session, tableName]);

    const mapFromDb = (item: any): T => {
        const mapped: any = { ...item };

        // common mappings
        if (item.card_limit !== undefined) mapped.limit = Number(item.card_limit ?? 0);
        if (item.current_debt !== undefined) mapped.currentDebt = Number(item.current_debt ?? 0);
        if (item.cutoff_day !== undefined) mapped.cutoffDay = item.cutoff_day;
        if (item.payment_due_day !== undefined) mapped.paymentDueDay = item.payment_due_day;

        if (item.target_amount !== undefined) mapped.targetAmount = Number(item.target_amount ?? 0);
        if (item.current_amount !== undefined) mapped.currentAmount = Number(item.current_amount ?? 0);

        if (item.limit_amount !== undefined) mapped.limitAmount = Number(item.limit_amount ?? 0);

        if (item.payment_day !== undefined) mapped.paymentDay = item.payment_day;
        if (item.is_active !== undefined) mapped.isActive = item.is_active ?? true;

        if (item.is_read !== undefined) mapped.isRead = item.is_read ?? false;

        if (item.credit_card_id !== undefined) mapped.creditCardId = item.credit_card_id;
        if (item.payment_method !== undefined) mapped.paymentMethod = item.payment_method;

        return mapped as T;
    };

    const mapToDb = (item: any): any => {
        const mapped: any = { ...item };
        delete mapped.id; // Let DB handle UUID if it's a new insert, or exclude if we manage manually

        // Remove camelCase fields that have snake_case equivalents
        if (item.limit !== undefined) {
            mapped.card_limit = item.limit;
            delete mapped.limit;
        }
        if (item.currentDebt !== undefined) {
            mapped.current_debt = item.currentDebt;
            delete mapped.currentDebt;
        }
        if (item.cutoffDay !== undefined) {
            mapped.cutoff_day = item.cutoffDay;
            delete mapped.cutoffDay;
        }
        if (item.paymentDueDay !== undefined) {
            mapped.payment_due_day = item.paymentDueDay;
            delete mapped.paymentDueDay;
        }

        if (item.targetAmount !== undefined) {
            mapped.target_amount = item.targetAmount;
            delete mapped.targetAmount;
        }
        if (item.currentAmount !== undefined) {
            mapped.current_amount = item.currentAmount;
            delete mapped.currentAmount;
        }

        if (item.limitAmount !== undefined) {
            mapped.limit_amount = item.limitAmount;
            delete mapped.limitAmount;
        }

        if (item.paymentDay !== undefined) {
            mapped.payment_day = item.paymentDay;
            delete mapped.paymentDay;
        }
        if (item.isActive !== undefined) {
            mapped.is_active = item.isActive;
            delete mapped.isActive;
        }

        if (item.isRead !== undefined) {
            mapped.is_read = item.isRead;
            delete mapped.isRead;
        }

        if (item.creditCardId !== undefined) {
            mapped.credit_card_id = item.creditCardId;
            delete mapped.creditCardId;
        }
        if (item.paymentMethod !== undefined) {
            mapped.payment_method = item.paymentMethod;
            delete mapped.paymentMethod;
        }

        // Filter out any other UI-only fields
        delete mapped.installment;

        return mapped;
    };

    const fetchData = async () => {
        if (!session) return;

        setLoading(true);
        const { data: fetchedData, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('user_id', session.user.id);

        if (error) {
            console.error(`Error fetching ${tableName}:`, error);
        } else {
            const mappedData = (fetchedData || []).map(mapFromDb);
            setData(mappedData);
        }
        setLoading(false);
    };

    const setValue = async (value: T[] | ((val: T[]) => T[])) => {
        if (!session) return;

        const newData = value instanceof Function ? value(data) : value;
        setData(newData);

        try {
            const { error: deleteError } = await supabase
                .from(tableName)
                .delete()
                .eq('user_id', session.user.id);

            if (deleteError) {
                console.error(`Error deleting ${tableName}:`, deleteError);
                return;
            }

            if (newData.length > 0) {
                const dataWithUserId = newData.map((item: any) => {
                    const dbItem = mapToDb(item);
                    return {
                        ...dbItem,
                        user_id: session.user.id
                    };
                });

                const { error: insertError } = await supabase
                    .from(tableName)
                    .insert(dataWithUserId);

                if (insertError) {
                    console.error(`Error syncing ${tableName}:`, insertError);
                }
            }
        } catch (error) {
            console.error(`Error syncing ${tableName}:`, error);
        }
    };

    return [data, setValue, loading];
}
