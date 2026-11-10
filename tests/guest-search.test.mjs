import test from 'node:test';
import assert from 'node:assert/strict';
import {searchGuests,normalizeName} from '../lib/guest-search.ts';
const guests=[{id:'1',name:'דנה לוי',phone:'050-0000000',guestNumber:'15'},{id:'2',name:'יואב משפחה'},{id:'3',name:'דנה כהן'},{id:'4',name:'שירה לוי'},{id:'5',name:'דנה לוי',phone:'0500000003'}];
test('name, reversed tokens, partial, missing letters and transposition',()=>{for(const q of ['דנה לוי','לוי דנה','לוי','דנה לואי','דנה לואי','דנהלוי'])assert.equal(searchGuests(guests,q)[0]?.guest.id,'1',q);});
test('wrong keyboard language',()=>assert.equal(searchGuests(guests,'ahrv kuh')[0]?.guest.id,'4'));
test('phone formats and guest number are exact',()=>{for(const q of ['0500000000','+972 50-0000000','00972500000000','15'])assert.equal(searchGuests(guests,q)[0]?.guest.id,'1');for(const q of ['0500000002','050123','1'])assert.equal(searchGuests(guests,q).length,0);});
test('duplicate names preserved, exact before fuzzy',()=>{assert.equal(searchGuests(guests,'דנה לוי').length,2);assert.equal(searchGuests(guests,'דנה כהן')[0].guest.id,'3');});
test('no noise or repeated token matches',()=>{for(const q of ['א','zzzzzz','דנה דנה',''])assert.equal(searchGuests(guests,q).length,0);assert.equal(normalizeName('כֹּהֵן'),normalizeName('כהן'));});
