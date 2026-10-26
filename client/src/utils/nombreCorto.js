export const formatearNombreCorto = value => String(value || '').normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es-MX').replace(/(^|[\s\-'’])\p{L}/gu, part => part.toLocaleUpperCase('es-MX'));
export const esNombreCorto = value => {
  const name = formatearNombreCorto(value);
  return name.length <= 80 && /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)* [\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u.test(name);
};
