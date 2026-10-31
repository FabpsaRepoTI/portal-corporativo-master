-- ════════════════════════════════════════════════════════════
-- Firmas precargadas de vigilancia: se suben una sola vez por
-- persona (login) y se reutilizan automáticamente en cada reporte
-- (en vez de firmar a mano cada vez). El PDF, cuando se construya,
-- debe tomar la imagen de aquí según quién quedó como
-- reportó/recibió/enterado1 en el reporte.
-- ════════════════════════════════════════════════════════════

CREATE TABLE vig_firmas (
  login              VARCHAR(255)  NOT NULL PRIMARY KEY REFERENCES sec_users(login),
  rutaArchivo        NVARCHAR(300) NOT NULL,
  fechaActualizacion DATETIME      NOT NULL DEFAULT GETDATE(),
  loginActualizo     VARCHAR(255)  NULL REFERENCES sec_users(login)
)
GO
