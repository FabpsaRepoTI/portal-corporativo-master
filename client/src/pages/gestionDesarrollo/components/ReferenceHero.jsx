import {useId} from "react";
import arteDesarrollo from "../../../assets/hero-desarrollo.svg";
import arteCronograma from "../../../assets/hero-cronograma.svg";
import arteDocumentacion from "../../../assets/hero-documentacion.svg";
import DevIcon from './DevIcon';
import developmentArt from '../../../assets/desarrollo-reference.png';
import scheduleArt from '../../../assets/cronograma-reference.png';
import documentationArt from '../../../assets/documentacion-reference.png';
const banners={
 development:{title:'Seguimiento de desarrollos internos',description:'Consulta avances, responsables y entregas de las áreas de FABPSA.',image:developmentArt,viewBox:'1300 78 216 122',width:1536,height:1024},
 schedule:{title:'Fechas y compromisos del equipo',description:'Revisa las etapas y próximas entregas de cada desarrollo.',image:scheduleArt,viewBox:'1450 72 330 164',width:1802,height:872},
 documentation:{title:'Documentación del área',description:'Consulta los manuales, procedimientos y archivos de los desarrollos internos.',image:documentationArt,viewBox:'1385 74 265 160',width:1672,height:941}
};
// Ilustraciones del encabezado: mismo estilo que el resto del portal (SVG sin fondo)
export default function ReferenceHero({schedule=false,documentation=false}){return <span className="gd-reference-hero gd-reference-hero--nube" aria-hidden="true"><img src={schedule?arteCronograma:documentation?arteDocumentacion:arteDesarrollo} alt=""/></span>;}
// Ícono del encabezado: el tema actual no lo muestra (ver PortalNube.css)
export function ReferenceHeadingIcon(){return null;}
