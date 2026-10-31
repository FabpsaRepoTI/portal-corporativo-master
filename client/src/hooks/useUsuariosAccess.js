import {useEffect, useState} from 'react';
import {useAuth} from './useAuth';
const denied = {puedeVerUsuarios:false,puedeCrear:false,puedeGestionarCreacion:false,puedeAsignarPermisos:false,puedeVerHistorialAccesos:false};

export default function useUsuariosAccess() {
  const {user} = useAuth();
  const [state,setState] = useState({...denied,loading:true});
  useEffect(() => {
    const controller = new AbortController();
    if (!user?.login) {setState({...denied,loading:false});return;}
    const refresh = async () => {
      try {
        const response = await fetch('/api/usuarios/capacidades',{headers:{Authorization:'Bearer '+localStorage.getItem('fabpsa_token')},signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw new Error();
        const data=await response.json();
        if(!controller.signal.aborted)setState({...denied,...data,loading:false});
      } catch {if(!controller.signal.aborted)setState({...denied,loading:false});}
    };
    setState({...denied,loading:true});refresh();
    window.addEventListener('focus',refresh);
    const timer=window.setInterval(refresh,60000);
    return()=>{controller.abort();window.removeEventListener('focus',refresh);window.clearInterval(timer);};
  },[user?.login,user?.area]);
  return state;
}
