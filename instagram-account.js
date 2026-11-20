// A Meta returns an app-scoped id and the professional-account user_id.
// Messaging webhooks identify the recipient by user_id, never by app-scoped id.
export function authenticatedAccountId(profile, { webhook = false, expectedUsername = 'minadeofertas_ofc' } = {}) {
  const normalized = value => String(value || '').trim().replace(/^@/, '').toLowerCase();
  const id = webhook ? profile?.user_id : profile?.id;
  if (normalized(profile?.username) !== normalized(expectedUsername) ||
      !/^\d{10,25}$/.test(String(id || ''))) {
    throw new Error('Instagram account validation failed');
  }
  return String(id);
}
