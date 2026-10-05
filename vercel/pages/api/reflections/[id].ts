import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '../../../src/lib/auth';
import { apiResponse } from '../../../src/lib/response';
import { supabaseAdmin } from '../../../src/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json(apiResponse(false, null, 'Unauthorized'));
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json(apiResponse(false, null, 'Reflection id is required'));
  }

  if (req.method === 'DELETE') {
    const { data, error } = await supabaseAdmin!
      .from('reflections')
      .delete()
      .eq('id', id)
      .eq('user_id', user.uid)
      .select()
      .single();

    if (error) {
      return res.status(500).json(apiResponse(false, null, error.message));
    }

    return res.status(200).json(apiResponse(true, { id, deleted: true, data }));
  }

  return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
}
