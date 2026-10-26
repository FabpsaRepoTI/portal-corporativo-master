function normalizarNombreCorto(value) {
  const clean = typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
  if (clean.length > 80 || !/^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)* [\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u.test(clean)) {
    throw new Error('Escribe un solo nombre y un apellido. Ejemplo: Juan Ramírez.');
  }
  return clean.toLocaleLowerCase('es-MX').replace(/(^|[\s\-'’])\p{L}/gu, part => part.toLocaleUpperCase('es-MX'));
}
module.exports = { normalizarNombreCorto };
