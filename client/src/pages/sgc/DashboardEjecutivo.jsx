// pages/sgc/DashboardEjecutivo.jsx
// Desempeño del SGI del SGI (Coordinador y Dirección):
//   Zona A  seis KPIs con color de semáforo
//   Zona B  NCs por origen (abiertas vs cerradas) y tendencia de 90 días por semana
//   Zona C  top 5 riesgos, próximas auditorías y acciones correctivas por vencer
// Los colores de las gráficas salen de los tokens del tema (useTokens).
import { Link, useOutletContext } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Encabezado,
  ErrorCarga,
  Panel,
  Skel,
  Vacio,
  useMigas,
  useTokens,
} from "./components/ui";
import { Nivel } from "./components/Matriz";
import {
  fechaCorta,
  fechaHora,
  mxn,
  nivelDe,
  sgcApi,
  useSgc,
  NIVELES,
} from "./sgcApi";

const TOKENS = [
  "--ok",
  "--warn",
  "--danger",
  "--brand",
  "--cyan",
  "--line",
  "--muted",
  "--ink",
  "--panel",
  "--line-2",
];

/** Verde >14 días, amarillo 7–14, rojo <7 (incluye vencidas). */
function Dias({ dias }) {
  const tono = dias < 7 ? "danger" : dias <= 14 ? "warn" : "ok";
  const texto =
    dias < 0 ? `${Math.abs(dias)} d vencida` : dias === 0 ? "hoy" : `${dias} d`;
  return <span className={`tag t-${tono} num`}>{texto}</span>;
}

function Kpi({ etiqueta, valor, tono, detalle, to, largo = false }) {
  const cuerpo = (
    <>
      <span className="kpi-x__etq">{etiqueta}</span>
      <strong className={`kpi-x__valor${largo ? " kpi-x__valor--largo" : ""}`}>
        {valor}
      </strong>
      {detalle && <span className="kpi-x__det">{detalle}</span>}
    </>
  );
  return to ? (
    <Link to={to} className={`kpi-x t-${tono}`}>
      {cuerpo}
    </Link>
  ) : (
    <div className={`kpi-x t-${tono}`}>{cuerpo}</div>
  );
}

function TooltipGrafica({ active, payload, label, formato }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="graf-tip">
      <b>{formato ? formato(label) : label}</b>
      {payload.map((p) => (
        <span key={p.dataKey}>
          <i style={{ background: p.color }} /> {p.name}:{" "}
          <b className="num">{p.value}</b>
        </span>
      ))}
    </div>
  );
}

export default function DashboardEjecutivo() {
  const { rol } = useOutletContext();
  const permitido = rol === 1 || rol === 4;
  const { data, error, cargando, recargar } = useSgc(
    () => (permitido ? sgcApi("/dashboard/ejecutivo") : Promise.resolve(null)),
    [permitido],
  );
  const t = useTokens(TOKENS);
  useMigas([
    { to: "/sgc/dashboard", label: "SGI" },
    { label: "Desempeño del SGI" },
  ]);

  if (!permitido) {
    return (
      <div className="sg-page">
        <div className="pnl">
          <Vacio
            icono="ti-lock"
            titulo="Vista para Coordinación y Dirección"
            texto="Desempeño del SGI está disponible para los roles Coordinador SGI y Dirección."
          />
        </div>
      </div>
    );
  }

  const k = data?.kpis;
  const semana = (v) => `Semana del ${fechaCorta(v, false)}`;
  const tendencia = (data?.nc_tendencia_90d || []).map((s) => ({
    ...s,
    etiqueta: fechaCorta(s.semana, false),
  }));

  return (
    <div className="sg-page">
      <Encabezado
        kicker="Revisión por la dirección"
        titulo="Desempeño del SGI"
        desc={data ? `Datos al ${fechaHora(data.generado)}` : "Cargando datos…"}
        acciones={
          <button className="btn" onClick={recargar} disabled={cargando}>
            <i
              className={`ti ${cargando ? "ti-loader-2 giro" : "ti-refresh"}`}
            />{" "}
            Actualizar datos
          </button>
        }
      />

      {error ? (
        <ErrorCarga error={error} onReintentar={recargar} />
      ) : !data ? (
        <div className="pnl">
          <Skel filas={10} />
        </div>
      ) : (
        <>
          {/* Zona A */}
          <section className="kpis-x" aria-label="Indicadores principales">
            <Kpi
              etiqueta="NCs abiertas"
              valor={k.nc_abiertas}
              tono={k.nc_abiertas ? "warn" : "ok"}
              to="/sgc/no-conformidades"
            />
            <Kpi
              etiqueta="NCs vencidas"
              valor={k.nc_vencidas}
              tono={k.nc_vencidas ? "danger" : "ok"}
              detalle={
                k.nc_abiertas
                  ? `${Math.round((100 * k.nc_vencidas) / k.nc_abiertas)}% de las abiertas`
                  : null
              }
              to="/sgc/no-conformidades?vencidas=1"
            />
            <Kpi
              etiqueta="NCs críticas"
              valor={k.nc_criticas}
              tono={k.nc_criticas ? "danger" : "ok"}
              detalle="abiertas, clasificación crítica"
            />
            <Kpi
              etiqueta="Eficacia AC"
              valor={k.ac_eficacia_pct == null ? "—" : `${k.ac_eficacia_pct}%`}
              tono={
                k.ac_eficacia_pct == null
                  ? "neutral"
                  : k.ac_eficacia_pct >= 80
                    ? "ok"
                    : k.ac_eficacia_pct >= 60
                      ? "warn"
                      : "danger"
              }
              detalle="verificadas eficaces / con compromiso vencido"
              to="/sgc/acciones-correctivas"
            />
            <Kpi
              etiqueta="Riesgos nivel alto"
              valor={k.riesgo_alto_count}
              tono={k.riesgo_alto_count ? "danger" : "ok"}
              detalle="activos, nivel > 12"
              to="/sgc/riesgos"
            />
            <Kpi
              etiqueta="Exposición económica"
              valor={mxn(k.exposicion_economica, false)}
              largo
              tono={k.exposicion_economica > 0 ? "danger" : "ok"}
              detalle="MXN · riesgos activos"
              to="/sgc/riesgos"
            />
          </section>

          {/* Zona B */}
          <div className="ejec-graficas">
            <Panel
              titulo="NCs por origen"
              sub="Todas las registradas: abiertas y cerradas"
            >
              {!data.nc_por_origen.length ? (
                <Vacio
                  compacto
                  icono="ti-chart-bar-off"
                  titulo="Sin no conformidades registradas"
                />
              ) : (
                <div
                  className="graf"
                  style={{
                    height: Math.max(220, data.nc_por_origen.length * 38 + 50),
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.nc_por_origen}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                      barCategoryGap={8}
                    >
                      <CartesianGrid stroke={t["--line"]} horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: t["--muted"], fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="origen"
                        width={150}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: t["--ink"], fontSize: 12 }}
                      />
                      <Tooltip
                        content={<TooltipGrafica />}
                        cursor={{ fill: t["--line"] }}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12, color: t["--muted"] }}
                      />
                      <Bar
                        dataKey="abiertas"
                        name="Abiertas"
                        stackId="a"
                        fill={t["--brand"]}
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="cerradas"
                        name="Cerradas"
                        stackId="a"
                        fill={t["--cyan"]}
                        radius={[0, 3, 3, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
            <Panel
              titulo="Tendencia 90 días"
              sub="NCs abiertas (detectadas) y cerradas por semana"
            >
              <div className="graf" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={tendencia}
                    margin={{ top: 8, right: 16, left: -12, bottom: 4 }}
                  >
                    <CartesianGrid stroke={t["--line"]} vertical={false} />
                    <XAxis
                      dataKey="semana"
                      tickFormatter={(v) => fechaCorta(v, false)}
                      tickLine={false}
                      axisLine={{ stroke: t["--line"] }}
                      tick={{ fill: t["--muted"], fontSize: 11 }}
                      interval="preserveStartEnd"
                      minTickGap={18}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: t["--muted"], fontSize: 11 }}
                    />
                    <Tooltip
                      content={<TooltipGrafica formato={semana} />}
                      cursor={{ stroke: t["--line-2"], strokeDasharray: "3 3" }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, color: t["--muted"] }}
                    />
                    <Line
                      type="monotone"
                      dataKey="abiertas"
                      name="Abiertas"
                      stroke={t["--danger"]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="cerradas"
                      name="Cerradas"
                      stroke={t["--ok"]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          {/* Zona C */}
          <div className="ejec-tablas">
            <Panel
              titulo="Top 5 riesgos"
              flush
              acciones={
                <Link to="/sgc/riesgos" className="btn btn--fantasma btn--sm">
                  Matriz
                </Link>
              }
            >
              {!data.riesgos_top5.length ? (
                <Vacio
                  compacto
                  icono="ti-shield-check"
                  titulo="Sin riesgos activos"
                />
              ) : (
                <table className="tabla tabla--compacta">
                  <tbody>
                    {data.riesgos_top5.map((r) => (
                      <tr key={r.idRiesgo}>
                        <td>
                          <Link
                            to={`/sgc/riesgos/${r.idRiesgo}`}
                            className="strong ink"
                          >
                            {r.nombre}
                          </Link>
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {r.categoria || "Sin categoría"} ·{" "}
                            {mxn(r.impactoEconomico)}
                          </div>
                          <div
                            className={`barra-nivel t-${NIVELES[nivelDe(r.nivel)].tono}`}
                            role="meter"
                            aria-valuemin={1}
                            aria-valuemax={25}
                            aria-valuenow={r.nivel}
                            aria-label={`Nivel ${r.nivel} de 25`}
                          >
                            <span
                              style={{ width: `${(r.nivel / 25) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="der">
                          <Nivel nivel={r.nivel} conTexto={false} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
            <Panel
              titulo="Próximas auditorías"
              flush
              acciones={
                <Link
                  to="/sgc/auditorias"
                  className="btn btn--fantasma btn--sm"
                >
                  Programa
                </Link>
              }
            >
              {!data.proximas_auditorias.length ? (
                <Vacio
                  compacto
                  icono="ti-calendar-off"
                  titulo="Sin auditorías planeadas"
                />
              ) : (
                <table className="tabla tabla--compacta">
                  <tbody>
                    {data.proximas_auditorias.map((a) => (
                      <tr key={a.idAuditoria}>
                        <td>
                          <Link
                            to={`/sgc/auditorias/${a.idAuditoria}`}
                            className="mono strong"
                          >
                            {a.folio}
                          </Link>
                          <div className="muted recorte" title={a.alcance}>
                            {a.alcance}
                          </div>
                        </td>
                        <td className="der">
                          <Dias dias={a.diasRestantes} />
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {fechaCorta(a.fechaPlan)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
            <Panel
              titulo="Acciones por vencer"
              sub="30 días"
              flush
              acciones={
                <Link
                  to="/sgc/acciones-correctivas"
                  className="btn btn--fantasma btn--sm"
                >
                  Ver todas
                </Link>
              }
            >
              {!data.acciones_por_vencer.length ? (
                <Vacio
                  compacto
                  icono="ti-circle-check"
                  titulo="Nada por vencer en 30 días"
                />
              ) : (
                <table className="tabla tabla--compacta">
                  <tbody>
                    {data.acciones_por_vencer.map((a) => (
                      <tr key={a.idAC}>
                        <td>
                          <Link
                            to={`/sgc/acciones-correctivas/${a.idAC}`}
                            className="mono strong"
                          >
                            {a.folioAC}
                          </Link>
                          {a.folioNC && (
                            <span
                              className="muted mono"
                              style={{ marginLeft: 6, fontSize: 11 }}
                            >
                              {a.folioNC}
                            </span>
                          )}
                          <div className="muted recorte" title={a.descripcion}>
                            {a.descripcion || "—"}
                          </div>
                          <div className="muted" style={{ fontSize: 11.5 }}>
                            {a.responsable || "Sin responsable"}
                          </div>
                        </td>
                        <td className="der">
                          <Dias dias={a.diasRestantes} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
