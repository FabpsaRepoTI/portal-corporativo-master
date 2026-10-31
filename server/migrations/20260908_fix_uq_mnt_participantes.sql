SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  IF EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE [name] = N'UQ_mnt_participantes'
      AND [parent_object_id] = OBJECT_ID(N'dbo.mnt_participantes')
  )
  BEGIN
    ALTER TABLE dbo.mnt_participantes
      DROP CONSTRAINT UQ_mnt_participantes;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE [name] = N'UQ_mnt_participantes'
      AND [parent_object_id] = OBJECT_ID(N'dbo.mnt_participantes')
  )
  BEGIN
    ALTER TABLE dbo.mnt_participantes
      ADD CONSTRAINT UQ_mnt_participantes
      UNIQUE (idSolicitud, tipoParticipacion, idPersonal);
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
