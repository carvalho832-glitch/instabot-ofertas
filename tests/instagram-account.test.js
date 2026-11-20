import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedAccountId } from '../instagram-account.js';

const profile = {
  id: '123456789012345',
  user_id: '17841442779350383',
  username: 'minadeofertas_ofc'
};

test('usa user_id profissional para comparar conta receptora do webhook', () => {
  assert.equal(authenticatedAccountId(profile, { webhook: true }), profile.user_id);
  assert.notEqual(authenticatedAccountId(profile, { webhook: true }), profile.id);
});

test('preserva id da API nas rotas existentes de comentários', () => {
  assert.equal(authenticatedAccountId(profile), profile.id);
});

test('bloqueia quando perfil é outro ou user_id está ausente', () => {
  assert.throws(() => authenticatedAccountId({...profile, username: 'outra_conta'}, {webhook:true}));
  assert.throws(() => authenticatedAccountId({...profile, user_id: undefined}, {webhook:true}));
  assert.throws(() => authenticatedAccountId({...profile, user_id: 'invalid'}, {webhook:true}));
});

test('aceita somente o próprio perfil mesmo com @ opcional', () => {
  assert.equal(authenticatedAccountId(profile, {webhook:true, expectedUsername:'@MinaDeOfertas_ofc'}),profile.user_id);
});
