import admin from 'firebase-admin';

export function getFirebaseAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  }

  return admin.initializeApp();
}

export async function verifyFirebaseToken(token: string) {
  try {
    const app = getFirebaseAdminApp();
    const decodedToken = await admin.auth(app).verifyIdToken(token);

    return {
      uid: decodedToken.uid,
      email: decodedToken.email ?? null,
    };
  } catch (error) {
    console.error('Invalid Firebase token', error);
    return null;
  }
}
