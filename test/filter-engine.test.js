import test from 'node:test';
import assert from 'node:assert/strict';
import {filterItems} from '../src/core/filter-engine.js';

const items=[
  {title:'Invoice archive',body:'client alpha',createdAt:'2024-01-10T00:00:00Z'},
  {title:'Old note',body:'misc',createdAt:'2022-05-01T00:00:00Z'}
];

test('filters by keyword',()=>assert.equal(filterItems(items,{query:'invoice'}).length,1));
test('filters by date range',()=>assert.deepEqual(filterItems(items,{from:'2023-01-01'}).map(x=>x.title),['Invoice archive']));
test('to date includes the whole selected UTC day',()=>assert.equal(filterItems([{title:'late',createdAt:'2024-01-10T23:59:59Z'}],{to:'2024-01-10'}).length,1));
test('empty filter keeps all items',()=>assert.equal(filterItems(items,{}).length,2));
