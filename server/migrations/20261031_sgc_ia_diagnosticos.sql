/* ============================================================================
   Diagnósticos de IA del Centro de control del SGC
   Portal Corporativo v4 · FABPSA · módulo SGC/SGI
   - alcance: 'empresa' (Coordinador, Auditor, Dirección) o el login del
     Responsable de área (su diagnóstico solo usa sus registros)
   - hashDatos: huella de las cifras y prioridades con que se generó; si los
     datos actuales cambian, la pantalla avisa que el diagnóstico es anterior
   Idempotente: se puede ejecutar más de una vez.
   ========================================================================== */

IF OBJECT_ID('dbo.sgc_ia_diagnosticos') IS NULL
BEGIN
  CREATE TABLE dbo.sgc_ia_diagnosticos (
    idDiagnostico   INT IDENTITY(1,1) CONSTRAINT PK_sgc_ia_diagnosticos PRIMARY KEY,
    idEmpresa       INT NOT NULL CONSTRAINT DF_sgc_ia_diagnosticos_empresa DEFAULT 1,
    alcance         VARCHAR(255) NOT NULL,
    hashDatos       CHAR(40) NOT NULL,
    contenido       NVARCHAR(MAX) NOT NULL,
    modelo          VARCHAR(60) NULL,
    login           VARCHAR(255) NOT NULL,
    fechaGeneracion DATETIME NOT NULL CONSTRAINT DF_sgc_ia_diagnosticos_fecha DEFAULT GETDATE()
  );
  CREATE INDEX IX_sgc_ia_diagnosticos_alcance ON dbo.sgc_ia_diagnosticos (idEmpresa, alcance, fechaGeneracion DESC);
END
GO
