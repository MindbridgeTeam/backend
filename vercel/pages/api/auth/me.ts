import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '../../../src/lib/auth';
import { apiResponse } from '../../../src/lib/response';
import { supabase } from '../../../src/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json(apiResponse(false, null, 'Invalid Firebase session'));
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('uid', user.uid)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json(apiResponse(false, null, profileError.message));
  }

  return res.status(200).json(
    apiResponse(true, {
      uid: user.uid,
      email: user.email,
      profile,
    })
  );
}
