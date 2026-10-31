const sql=require('mssql');
async function actualizar(db,id,value,user){
 if(value==null)return;
 const prioridad=Number(value);
 if(!Number.isSafeInteger(prioridad)||prioridad<1)throw new Error('Selecciona una prioridad válida.');
 const found=await db.request().input('prioridad',sql.Int,prioridad).query('SELECT prioridad FROM cat_prioridad WHERE idPrioridad=@prioridad');
 if(!found.recordset.length)throw new Error('Selecciona una prioridad válida.');
 await db.request().input('id',sql.Int,id).input('prioridad',sql.Int,prioridad).input('login',sql.VarChar(255),user.login).input('nombre',sql.NVarChar(200),user.name||user.login).query(`
 DECLARE @anterior INT=(SELECT idPrioridad FROM solicitudTI WITH (UPDLOCK,HOLDLOCK) WHERE idSolicitud=@id);
 IF @anterior IS NULL OR @anterior<>@prioridad BEGIN
 UPDATE solicitudTI SET idPrioridad=@prioridad,fechaActualizacion=GETDATE() WHERE idSolicitud=@id;
 INSERT INTO solicitudTI_bitacora(idSolicitud,idUsuario,nombreUsuario,nota,fecha)
 SELECT @id,@login,@nombre,CONCAT('Prioridad: ',COALESCE((SELECT prioridad FROM cat_prioridad WHERE idPrioridad=@anterior),'Sin prioridad'),' → ',prioridad),GETDATE() FROM cat_prioridad WHERE idPrioridad=@prioridad;
 END;`);
}
module.exports={actualizar};
