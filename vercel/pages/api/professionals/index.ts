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
    const { data, error } = await supabaseAdmin!
      .from('professionals')
      .select('*')
      .eq('verified', true)
      .order('display_name', { ascending: true });

    if (error) {
      return res.status(500).json(apiResponse(false, null, error.message));
    }

    return res.status(200).json(apiResponse(true, data ?? []));
  }

  if (req.method === 'POST') {
    const { displayName, bio, specialties = [] } = req.body ?? {};
    if (!displayName || typeof displayName !== 'string') {
      return res.status(400).json(apiResponse(false, null, 'Display name is required'));
    }

    const { data, error } = await supabaseAdmin!
      .from('professionals')
      .upsert(
        {
          uid: user.uid,
          display_name: displayName,
          bio: bio ?? null,
          specialties: Array.isArray(specialties) ? specialties : [],
          verified: false,
          availability: {},
        },
        { onConflict: 'uid' }
      )
      .select()
      .single();

    if (error) {
      return res.status(500).json(apiResponse(false, null, error.message));
    }

    return res.status(200).json(apiResponse(true, data));
  }

  return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
}
