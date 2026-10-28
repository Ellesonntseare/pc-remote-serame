'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{accountScope}=require('../account-scope');
test('configured Google owner and local owner share one stable workspace',()=>{
  const owner={provider:'google',subject:'verified-main-google-subject',email:'owner@example.test'},main=identity=>identity.subject===owner.subject;assert.equal(accountScope({role:'owner'},main),'owner');assert.equal(accountScope({role:'owner',identity:owner},main),'owner');assert.equal(accountScope({role:'account',identity:owner},main),'owner');
});
test('other Google identities retain stable separate workspaces and guests have no owner scope',()=>{
  const a={provider:'google',subject:'other-a',email:'a@example.test'},b={provider:'google',subject:'other-b',email:'b@example.test'};assert.notEqual(accountScope({role:'owner',identity:a}),accountScope({role:'owner',identity:b}));assert.equal(accountScope({role:'account',identity:a}),accountScope({role:'owner',identity:a}));assert.equal(accountScope({role:'guest',identity:a}),null);assert.equal(accountScope(null),null);
});
