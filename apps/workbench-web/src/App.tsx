import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { bootstrapSession, setCsrf } from "./api/client";
import { useWorkbenchContext, WriteProvider } from "./api/hooks";
import { AppShell } from "./components/AppShell";
import { ConnectionFailure, FullPageLoading } from "./components/States";
import { ChangeRoom } from "./pages/change/ChangeRoom";
import { ChangesPage } from "./pages/ChangesPage";
import { DecisionsPage } from "./pages/DecisionsPage";
import { HomePage } from "./pages/HomePage";
import { RunConsole } from "./pages/RunConsole";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => { bootstrapSession().then(() => setReady(true), (error: Error) => setFailure(error.message)); }, []);
  if (failure) return <ConnectionFailure message={failure} />;
  if (!ready) return <FullPageLoading />;
  return <Session />;
}

function Session() {
  const context = useWorkbenchContext();
  useEffect(() => { if (context.data) setCsrf(context.data.csrf); }, [context.data]);
  if (context.isError) return <ConnectionFailure message={context.error.message} />;
  if (!context.data) return <FullPageLoading />;
  return (
    <WriteProvider project={context.data.project_id}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="changes" element={<ChangesPage />} />
            <Route path="changes/:changeId" element={<ChangeRoom />} />
            <Route path="changes/:changeId/:tab" element={<ChangeRoom />} />
            <Route path="decisions" element={<DecisionsPage />} />
            <Route path="runs/:runId" element={<RunConsole />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WriteProvider>
  );
}
