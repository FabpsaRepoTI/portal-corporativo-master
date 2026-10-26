-- 20261022_sit_documento_contenido.sql
-- SIT: "También contiene". Un PDF de SharePoint puede traer, además de su
-- tipo, otros documentos (p. ej. una Ficha Técnica que incluye la Tabla
-- Nutrimental). Cada fila dice qué tipo contiene un archivo y en qué página.
--  - Cuenta para el cumplimiento de requisitoriedad: el tipo contenido queda
--    cubierto mientras el documento que lo trae esté vigente.
--  - origen: MANUAL (marcado a mano) o IA (sugerido por la lectura del PDF y
--    confirmado por la persona).
-- Idempotente: se puede correr más de una vez.

IF OBJECT_ID('sit_documento_contenido') IS NULL
BEGIN
  CREATE TABLE sit_documento_contenido (
    sharepointId   NVARCHAR(200) NOT NULL,
    idTipoDoc      TINYINT       NOT NULL REFERENCES sit_tipos_documento (idTipoDoc),
    pagina         INT           NULL,
    origen         VARCHAR(10)   NOT NULL CONSTRAINT DF_sit_doc_contenido_origen DEFAULT 'MANUAL',
    registradoPor  NVARCHAR(50)  NOT NULL,
    fechaRegistro  DATETIME      NOT NULL CONSTRAINT DF_sit_doc_contenido_fecha DEFAULT GETDATE(),
    CONSTRAINT PK_sit_documento_contenido PRIMARY KEY (sharepointId, idTipoDoc),
    CONSTRAINT CK_sit_doc_contenido_origen CHECK (origen IN ('MANUAL', 'IA')),
    CONSTRAINT CK_sit_doc_contenido_pagina CHECK (pagina IS NULL OR (pagina BETWEEN 1 AND 2000))
  );
END
