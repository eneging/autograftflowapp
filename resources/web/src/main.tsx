import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Marco } from "./componentes/Marco";
import { NuevaSolicitud } from "./paginas/NuevaSolicitud";
import { VerSolicitud } from "./paginas/VerSolicitud";
import { Aprobar } from "./paginas/Aprobar";
import { Admin } from "./paginas/Admin";
import { Acceso, Inicio, SinCuenta } from "./plataforma/Portada";
import { Panel } from "./plataforma/Panel";
import { ConSesion, SesionProveedor } from "./plataforma/sesion";
import { MiPlan, ResultadoPago } from "./plataforma/Planes";
import { Estadisticas } from "./plataforma/Estadisticas";
import { Equipo } from "./plataforma/Equipo";
import { Verificar } from "./plataforma/Verificar";
import { Olvide, Restablecer } from "./plataforma/Recuperar";
import { GuiaProveedor } from "./plataforma/GuiaProceso";
const LibroReclamaciones = lazy(() => import("./reclamaciones/Libro").then(m => ({ default: m.LibroReclamaciones })));
const AdminReclamaciones = lazy(() => import("./reclamaciones/AdminReclamaciones").then(m => ({ default: m.AdminReclamaciones })));
const ReferidosPagina = lazy(() => import("./plataforma/Referidos").then(m => ({ default: m.ReferidosPagina })));
const Asistente = lazy(() => import("./plataforma/Asistente").then(m => ({ default: m.Asistente })));
// Las páginas que dibujan PDF cargan pdf.js aparte, solo cuando se abren.
const DocumentoPagina = lazy(() => import("./plataforma/Documento").then((m) => ({ default: m.DocumentoPagina })));
const FlowTools = lazy(() => import("./plataforma/flow/FlowTools").then((m) => ({ default: m.FlowTools })));
const HerramientasPdf = lazy(() => import("./plataforma/pdf/HerramientasPdf").then((m) => ({ default: m.HerramientasPdf })));
const PerfilPagina = lazy(() => import("./plataforma/Perfil").then((m) => ({ default: m.PerfilPagina })));
const Firmar = lazy(() => import("./plataforma/Firmar").then((m) => ({ default: m.Firmar })));
const cargando = <div className="card"><p id="loading">Cargando…</p></div>;
import "./estilos.css";
import "./plataforma/plataforma.css";
import "./plataforma/planes.css";
import "./tema.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SesionProveedor>
      <GuiaProveedor>
        <Marco>
          <Suspense fallback={cargando}>
          <Routes>
            {/* Plataforma: firma de cualquier PDF */}
            <Route path="/" element={<Inicio />} />
            <Route path="/como-funciona" element={<Asistente />} />
            <Route path="/ingresar" element={<Acceso modo="ingresar" />} />
            <Route path="/registro" element={<Acceso modo="registro" />} />
            <Route path="/sin-cuenta" element={<SinCuenta />} />
            <Route path="/olvide" element={<Olvide />} />
            <Route path="/restablecer" element={<Restablecer />} />
            <Route path="/app" element={<ConSesion><Panel /></ConSesion>} />
            <Route path="/app/flow-tools/:app?" element={<ConSesion><FlowTools /></ConSesion>} />
            <Route path="/app/pdf/:herramienta?"element={<ConSesion><HerramientasPdf /></ConSesion>} />
            <Route path="/app/d/:id"element={<ConSesion><DocumentoPagina /></ConSesion>} />
            <Route path="/f/:token" element={<Firmar />} />
            <Route path="/planes" element={<Inicio soloPlanes />} />
            <Route path="/verificar" element={<Verificar />} />
            <Route path="/app/cuenta" element={<ConSesion><MiPlan /></ConSesion>} />
            <Route path="/app/perfil" element={<ConSesion><PerfilPagina /></ConSesion>} />
            <Route path="/app/referidos" element={<ConSesion><ReferidosPagina /></ConSesion>} />
            <Route path="/referidos" element={<ReferidosPagina publico />} />
            <Route path="/app/estadisticas" element={<ConSesion><Estadisticas /></ConSesion>} />
            <Route path="/app/equipo" element={<ConSesion><Equipo /></ConSesion>} />
            <Route path="/app/pago" element={<ConSesion><ResultadoPago /></ConSesion>} />
            {/* Plantilla: Solicitud de reembolso */}
            <Route path="/reembolso" element={<NuevaSolicitud />} />
            <Route path="/s/:token" element={<VerSolicitud />} />
            <Route path="/a/:token" element={<Aprobar />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/libro-de-reclamaciones" element={<LibroReclamaciones />} />
            <Route path="/admin/reclamaciones" element={<AdminReclamaciones />} />
            <Route path="*" element={<div className="card"><div className="afAlerta">Página no encontrada. <Link to="/">Ir al inicio</Link></div></div>} />
          </Routes>
          </Suspense>
        </Marco>
      </GuiaProveedor>
      </SesionProveedor>
    </BrowserRouter>
  </StrictMode>,
);
