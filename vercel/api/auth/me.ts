import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../src/lib/supabase';
import { apiResponse } from '../../src/lib/response';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json(apiResponse(false, null, 'Missing bearer token'));
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json(apiResponse(false, null, 'Invalid session'));
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('uid', user.id)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json(apiResponse(false, null, profileError.message));
  }

  return res.status(200).json(
    apiResponse(true, {
      uid: user.id,
      email: user.email,
      profile,
    })
  );
}
