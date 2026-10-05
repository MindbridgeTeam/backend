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
      .from('consultation_requests')
      .select('*')
      .or(`student_id.eq.${user.uid},professional_id.eq.${user.uid}`)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json(apiResponse(false, null, error.message));
    }

    return res.status(200).json(apiResponse(true, data ?? []));
  }

  if (req.method === 'POST') {
    const { professionalId, reason, urgency = 'medium' } = req.body ?? {};
    if (!reason || typeof reason !== 'string') {
      return res.status(400).json(apiResponse(false, null, 'Reason is required'));
    }

    const { data, error } = await supabaseAdmin!
      .from('consultation_requests')
      .insert({
        student_id: user.uid,
        professional_id: professionalId ?? null,
        status: 'SUBMITTED',
        reason,
        urgency,
        status_history: [{
          from: null,
          to: 'SUBMITTED',
          actorId: user.uid,
          actorRole: 'student',
          note: 'Submitted by student',
          at: new Date().toISOString(),
        }],
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
