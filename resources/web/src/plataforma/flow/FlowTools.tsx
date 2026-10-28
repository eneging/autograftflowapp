import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Link, useParams } from "react-router-dom";
import { CargaLogo } from "../../componentes/CargaLogo";
import { BotonFavorito } from "../../componentes/favoritos";
import { EtiquetaNueva } from "../pdf/herramientas";
import { IconoApp } from "./IconoApp";
import { APPS_FLOW, ETIQUETA_ESTADO, type AppFlow, type EstadoApp } from "./apps";
import "./flow-tools.css";

/** Apps propias (páginas React), cada una cargada solo al abrirla. */
const NATIVAS: Record<string, LazyExoticComponent<ComponentType>> = {
  "ex-trae": lazy(() => import("./ExTrae")),
};

/** «Flow Tools»: catálogo de apps (separadas en completas y beta) y cada app abierta dentro de la plataforma. */
export function FlowTools() {
  const { app } = useParams();
  const elegida = app ? APPS_FLOW.find((a) => a.id === app) : undefined;
  if (app && !elegida) return <div className="card"><div className="afAlerta">No encontramos esa herramienta. <Link to="/app/flow-tools">Ver Flow Tools</Link></div></div>;
  return elegida ? <AppAbierta app={elegida} /> : <Catalogo />;
}

const GRUPOS: { estado: EstadoApp; titulo: string; texto: string; vacio: string }[] = [
  { estado: "completa", titulo: "Listas para usar", texto: "Herramientas terminadas y probadas.", vacio: "Pronto habrá herramientas aquí: las que están en Beta pasarán a esta sección cuando estén terminadas." },
  { estado: "beta", titulo: "En Beta", texto: "Ya puedes usarlas mientras las terminamos. Pueden cambiar o tener errores: revisa siempre sus resultados.", vacio: "No hay herramientas en Beta por ahora." },
];

function Catalogo() {
  return (
    <div className="ftPagina">
      <header className="ftCabecera">
        <span className="ftMarca" aria-hidden>⚡</span>
        <div>
          <h1>Flow Tools</h1>
          <p>Más aplicaciones de AutograFlow para tu día a día, además de firmar documentos.</p>
        </div>
      </header>
      {GRUPOS.map((g) => {
        const apps = APPS_FLOW.filter((a) => a.estado === g.estado);
        return (
          <section key={g.estado} className="ftGrupo" aria-labelledby={`ft-${g.estado}`}>
            <div className="ftGrupoCabecera">
              <h2 id={`ft-${g.estado}`}>{g.titulo} <span className={`ftEstado ft-${g.estado}`}>{apps.length}</span></h2>
              <p>{g.texto}</p>
            </div>
            {apps.length ? <div className="ftLista">{apps.map((a) => <Tarjeta key={a.id} app={a} />)}</div> : <p className="ftVacio">{g.vacio}</p>}
          </section>
        );
      })}
    </div>
  );
}

function Tarjeta({ app }: { app: AppFlow }) {
  return (
    <div className={`ftCelda ${app.especial ? "especial" : ""}`}>
      <Link to={`/app/flow-tools/${app.id}`} className={`ftTarjeta ${app.especial ? "especial" : ""}`}>
        {app.especial && <span className="ftNuevo"><EtiquetaNueva /></span>}
        <div className="ftTarjetaCabecera">
          <span className="ftIcono" aria-hidden><IconoApp app={app} tam={24} /></span>
          <strong className={app.especial ? "hrNombreEspecial" : undefined}>{app.nombre}</strong>
          <span className={`ftEstado ft-${app.estado}`}>{ETIQUETA_ESTADO[app.estado]}</span>
        </div>
        <p>{app.resumen}</p>
        <div className="ftEtiquetas">{app.etiquetas.map((e) => <span key={e}>{e}</span>)}</div>
        <span className="ftAbrir">Abrir {app.nombre} →</span>
      </Link>
      <BotonFavorito acceso={`flow:${app.id}`} className="ftFavorito" />
    </div>
  );
}

/** La app dentro de la plataforma: propia (React) o estática embebida (misma web: portapapeles y cámara permitidos). */
function AppAbierta({ app }: { app: AppFlow }) {
  const Nativa = NATIVAS[app.id];
  return (
    <div className="ftAbierta">
      <div className="ftBarra">
        <Link to="/app/flow-tools" className="boton botonChico">← Flow Tools</Link>
        <span className={`ftIcono ftIconoChico ${app.especial ? "especial" : ""}`} aria-hidden><IconoApp app={app} tam={20} /></span>
        <strong className={app.especial ? "hrNombreEspecial" : undefined}>{app.nombre}</strong>
        {app.especial && <EtiquetaNueva />}
        <span className={`ftEstado ft-${app.estado}`}>{ETIQUETA_ESTADO[app.estado]}</span>
        <span className="ftFamilia">FlowApp</span>
        <BotonFavorito acceso={`flow:${app.id}`} conTexto />
        {app.url && <a className="boton botonChico ftNueva" href={app.url} target="_blank" rel="noopener">Abrir en pestaña nueva ↗</a>}
      </div>
      {app.estado === "beta" && <p className="ftAvisoBeta">🧪 <strong>Herramienta en Beta.</strong> Ya funciona, pero la seguimos mejorando: revisa sus resultados antes de usarlos.</p>}
      {Nativa
        ? <Suspense fallback={<div className="ftCargando"><CargaLogo tam={48} texto={`Abriendo ${app.nombre}…`} /></div>}><Nativa /></Suspense>
        : app.url && <iframe className="ftMarco" src={app.url} title={app.nombre} allow="clipboard-write; camera" />}
    </div>
  );
}
