import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import UnifiedHome from "@/pages/UnifiedHome";
import Admin from "@/pages/Admin";
import Projects from "@/pages/Projects";
import PhotoLibrary from "@/pages/PhotoLibrary";
import ProjectAlbum from "@/pages/ProjectAlbum";
import QueuePage from "@/pages/QueuePage";
import AudioPage from "@/pages/AudioPage";
import Studio from "@/pages/Studio";
import Header from './components/Header';
import MobileNavBar from './components/MobileNavBar';

function Router() {
  return (
    <Switch>
      <Route path="/" component={UnifiedHome} />
      <Route path="/create" component={UnifiedHome} />
      <Route path="/project/:id/review" component={UnifiedHome} />
      <Route path="/audio" component={AudioPage} />
      <Route path="/projects" component={Projects} />
      <Route path="/project/new" component={Home} />
      <Route path="/project/:id" component={Home} />
      <Route path="/library" component={PhotoLibrary} />
      <Route path="/library/:id" component={ProjectAlbum} />
      <Route path="/studio" component={Studio} />
      <Route path="/queue" component={QueuePage} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="dark">
          <Toaster />
          <div className="flex flex-col h-full min-h-screen bg-gradient-to-br from-background to-muted safe-area-inset">
            <Header />
            <main className="flex-1 pb-20 lg:pb-0 mobile-scroll-container">
              <Router />
            </main>
            <MobileNavBar />
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
