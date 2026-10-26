// Service catalog SLAs are minutes. Never infer units from the legacy column names.
function formatSlaDuration(minutes) {
  if (minutes == null || minutes === '' || !Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return '—';
  const total = Math.round(Number(minutes));
  if (!total) return 'Menos de 1 minuto';
  const hours = Math.floor(total / 60), remainder = total % 60;
  return [hours ? `${hours} hora${hours === 1 ? '' : 's'}` : '', remainder ? `${remainder} minuto${remainder === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
}
module.exports = { formatSlaDuration };
