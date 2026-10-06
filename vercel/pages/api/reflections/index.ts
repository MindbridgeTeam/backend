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
      .from('reflections')
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
    const { content, mood } = req.body ?? {};
    if (!content || typeof content !== 'string') {
      return res.status(400).json(apiResponse(false, null, 'Content is required'));
    }

    const { data, error } = await supabaseAdmin!
      .from('reflections')
      .insert({
        user_id: user.uid,
        content,
        mood: mood ?? null,
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
