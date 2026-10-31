SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF OBJECT_ID(N'dbo.mnt_evaluaciones', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.mnt_evaluaciones (
      idEvaluacion INT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_mnt_evaluaciones PRIMARY KEY,
      idSolicitud INT NOT NULL,
      evaluacion TINYINT NOT NULL,
      calificacionAtencion TINYINT NULL,
      calificacionServicio TINYINT NULL,
      observacion VARCHAR(1000) NULL,
      loginEvaluador VARCHAR(100) NOT NULL,
      fechaEvaluacion DATETIME2 NOT NULL
        CONSTRAINT DF_mnt_evaluaciones_fecha DEFAULT GETDATE(),
      CONSTRAINT FK_mnt_evaluaciones_solicitud
        FOREIGN KEY (idSolicitud) REFERENCES dbo.mnt_solicitudes(idSolicitud),
      CONSTRAINT CK_mnt_evaluaciones_resultado CHECK (evaluacion IN (1, 2)),
      CONSTRAINT CK_mnt_evaluaciones_atencion
        CHECK (calificacionAtencion IS NULL OR calificacionAtencion BETWEEN 1 AND 5),
      CONSTRAINT CK_mnt_evaluaciones_servicio
        CHECK (calificacionServicio IS NULL OR calificacionServicio BETWEEN 1 AND 5)
    );

    CREATE INDEX IX_mnt_evaluaciones_solicitud_fecha
      ON dbo.mnt_evaluaciones (idSolicitud, fechaEvaluacion DESC);
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
