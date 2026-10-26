"use strict";
const EXCLUIDOS = new Set(['jorge gonzalez','lizbet hernandez','sofia rodriguez']);
const normalizar = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const normalizarLogin = value => String(value || '').trim().toLowerCase();
// Activity and Systems membership are checked in the sec_users query.
const esDesarrolladorPermitido = nombre => !EXCLUIDOS.has(normalizar(nombre));
module.exports = {esDesarrolladorPermitido,normalizarLogin};
