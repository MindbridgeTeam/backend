import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '../../../src/lib/auth';
import { apiResponse } from '../../../src/lib/response';
import { supabaseAdmin } from '../../../src/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json(apiResponse(false, null, 'Unauthorized'));
  }

  if (req.method !== 'GET') {
    return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
  }

  const days = Number(req.query.days ?? 7);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin!
    .from('check_ins')
    .select('*')
    .eq('user_id', user.uid)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json(apiResponse(false, null, error.message));
  }

  const moods = (data ?? []).map((item) => Number(item.mood));
  const overallAverage = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;

  return res.status(200).json(
    apiResponse(true, {
      windowDays: days,
      totalCheckIns: data?.length ?? 0,
      overallAverage,
      dailyAverages: (data ?? []).map((item) => ({
        date: item.created_at?.slice(0, 10),
        average: Number(item.mood),
      })),
    })
  );
}
