import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '../../../src/lib/auth';
import { apiResponse } from '../../../src/lib/response';
import { supabaseAdmin } from '../../../src/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json(apiResponse(false, null, 'Unauthorized'));
  }

  if (req.method === 'GET') {
    const { data: plans, error: plansError } = await supabaseAdmin!
      .from('self_help_plans')
      .select('*')
      .eq('user_id', user.uid)
      .order('created_at', { ascending: false });

    if (plansError) {
      return res.status(500).json(apiResponse(false, null, plansError.message));
    }

    const promises = (plans ?? []).map(async (plan) => {
      const { data: tasks } = await supabaseAdmin!
        .from('self_help_tasks')
        .select('*')
        .eq('plan_id', plan.id)
        .order('created_at', { ascending: true });

      return { ...plan, tasks: tasks ?? [] };
    });

    const enrichedPlans = await Promise.all(promises);
    return res.status(200).json(apiResponse(true, enrichedPlans));
  }

  if (req.method === 'POST') {
    const { title, description, tasks = [] } = req.body ?? {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json(apiResponse(false, null, 'Title is required'));
    }

    const { data: plan, error: planError } = await supabaseAdmin!
      .from('self_help_plans')
      .insert({
        user_id: user.uid,
        title,
        description: description ?? null,
        status: 'active',
      })
      .select()
      .single();

    if (planError) {
      return res.status(500).json(apiResponse(false, null, planError.message));
    }

    const taskRows = (tasks ?? []).map((task: any) => ({
      plan_id: plan.id,
      title: task.title,
      notes: task.notes ?? null,
      completed: false,
      due_date: task.dueDate ? new Date(task.dueDate).toISOString() : null,
    }));

    const { data: taskData, error: tasksError } = await supabaseAdmin!
      .from('self_help_tasks')
      .insert(taskRows)
      .select();

    if (tasksError) {
      return res.status(500).json(apiResponse(false, null, tasksError.message));
    }

    return res.status(200).json(
      apiResponse(true, {
        ...plan,
        tasks: taskData ?? [],
      })
    );
  }

  return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
}
