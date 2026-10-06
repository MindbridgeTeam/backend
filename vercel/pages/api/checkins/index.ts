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
    const pageSize = Math.min(Number(req.query.pageSize ?? 30), 100);

    const { data, error } = await supabaseAdmin!
      .from('check_ins')
      .select('*')
      .eq('user_id', user.uid)
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (error) {
      return res.status(500).json(apiResponse(false, null, error.message));
    }

    return res.status(200).json(apiResponse(true, data ?? []));
  }

  if (req.method === 'POST') {
    const { mood, notes, tags = [] } = req.body ?? {};
    if (typeof mood !== 'number') {
      return res.status(400).json(apiResponse(false, null, 'Mood is required'));
    }

    const { data, error } = await supabaseAdmin!
      .from('check_ins')
      .insert({
        user_id: user.uid,
        mood,
        notes: notes ?? null,
        tags: Array.isArray(tags) ? tags : [],
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json(apiResponse(false, null, error.message));
    }

    return res.status(200).json(apiResponse(true, data));
  }

  return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
}
