import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '../../../src/lib/auth';
import { apiResponse } from '../../../src/lib/response';
import { supabaseAdmin } from '../../../src/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json(apiResponse(false, null, 'Unauthorized'));
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
  }

  const { planId, taskId, title, notes, dueDate, completed } = req.body ?? {};
  if (!planId || !taskId) {
    return res.status(400).json(apiResponse(false, null, 'Plan id and task id are required'));
  }

  const update: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof title === 'string') update.title = title;
  if (typeof notes === 'string') update.notes = notes;
  if (dueDate !== undefined) update.due_date = dueDate ? new Date(dueDate).toISOString() : null;
  if (typeof completed === 'boolean') update.completed = completed;

  const { data, error } = await supabaseAdmin!
    .from('self_help_tasks')
    .update(update)
    .eq('id', taskId)
    .eq('plan_id', planId)
    .select();

  if (error) {
    return res.status(500).json(apiResponse(false, null, error.message));
  }

  const task = data?.[0];
  if (!task) {
    return res.status(404).json(apiResponse(false, null, 'Task not found'));
  }

  return res.status(200).json(apiResponse(true, task));
}
