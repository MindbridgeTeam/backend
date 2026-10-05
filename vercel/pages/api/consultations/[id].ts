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
    return res.status(400).json(apiResponse(false, null, 'Consultation id is required'));
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin!
      .from('consultation_requests')
      .select('*')
      .eq('id', id)
      .or(`student_id.eq.${user.uid},professional_id.eq.${user.uid}`)
      .single();

    if (error) {
      return res.status(500).json(apiResponse(false, null, error.message));
    }

    return res.status(200).json(apiResponse(true, data));
  }

  if (req.method === 'PATCH') {
    const { status, professionalId } = req.body ?? {};
    const update: Record<string, any> = { updated_at: new Date().toISOString() };

    if (status) update.status = status;
    if (professionalId) update.professional_id = professionalId;

    const { data, error } = await supabaseAdmin!
      .from('consultation_requests')
      .update(update)
      .eq('id', id)
      .or(`student_id.eq.${user.uid},professional_id.eq.${user.uid}`)
      .select()
      .single();

    if (error) {
      return res.status(500).json(apiResponse(false, null, error.message));
    }

    return res.status(200).json(apiResponse(true, data));
  }

  return res.status(405).json(apiResponse(false, null, 'Method not allowed'));
}
