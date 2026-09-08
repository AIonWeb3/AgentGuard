import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { SessionProvider } from "./lib/session";
import { AgentDetail } from "./pages/AgentDetail";
import { Console } from "./pages/Console";
import { Integrate } from "./pages/Integrate";
import { Landing } from "./pages/Landing";
import { Verify } from "./pages/Verify";

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Landing />} />
            <Route path="app" element={<Console />} />
            <Route path="app/agents/:agentId" element={<AgentDetail />} />
            <Route path="verify" element={<Verify />} />
            <Route path="integrate" element={<Integrate />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
