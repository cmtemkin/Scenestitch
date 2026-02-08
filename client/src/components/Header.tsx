import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Settings, Image, FolderClosed, Menu, X, Clock, Plus, Zap, Video, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/30 bg-card/80 backdrop-blur-xl">
      <div className="container h-14 md:h-16 max-w-screen-2xl 3xl:max-w-[1920px] 4xl:max-w-[2400px] items-center justify-between flex px-4 md:px-6 lg:px-8 xl:px-10">
        {/* Logo with Batman-inspired styling */}
        <div className="flex items-center gap-2 md:gap-3 lg:gap-4 min-w-0 flex-1">
          <Link href="/">
            <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3 cursor-pointer group">
              <div className="w-7 h-7 md:w-8 md:h-8 lg:w-9 lg:h-9 xl:w-10 xl:h-10 bg-gradient-to-br from-primary to-yellow-400 rounded-lg flex items-center justify-center shadow-lg group-hover:shadow-primary/25 transition-all duration-300 flex-shrink-0">
                <Zap className="h-3.5 w-3.5 md:h-4 md:w-4 lg:h-5 lg:w-5 text-black" />
              </div>
              <span className="font-bold text-lg md:text-xl lg:text-2xl bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent truncate">
                SceneStitch
              </span>
            </div>
          </Link>
        </div>
        
        {/* Modern desktop navigation with audio-first workflow */}
        <nav className="hidden lg:flex items-center lg:gap-1 xl:gap-2">
          <div className="nav-modern lg:gap-1 xl:gap-2">
            <Link href="/">
              <div className={`nav-item ${location === '/' || location.startsWith('/audio') ? 'active' : ''}`}>
                <Plus className="h-4 w-4 mr-2" />
                <span>Create</span>
              </div>
            </Link>
            <Link href="/projects">
              <div className={`nav-item ${location.startsWith('/projects') || location.startsWith('/project') ? 'active' : ''}`}>
                <FolderClosed className="h-4 w-4 mr-2" />
                <span>Projects</span>
              </div>
            </Link>
            <Link href="/rebuild">
              <div className={`nav-item ${location.startsWith('/rebuild') ? 'active' : ''}`}>
                <Sparkles className="h-4 w-4 mr-2" />
                <span>Rebuild</span>
              </div>
            </Link>
            <Link href="/library">
              <div className={`nav-item ${location.startsWith('/library') ? 'active' : ''}`}>
                <Image className="h-4 w-4 mr-2" />
                <span>Gallery</span>
              </div>
            </Link>
            <Link href="/studio">
              <div className={`nav-item ${location.startsWith('/studio') ? 'active' : ''}`}>
                <Video className="h-4 w-4 mr-2" />
                <span>Studio</span>
              </div>
            </Link>
            <Link href="/queue">
              <div className={`nav-item ${location.startsWith('/queue') ? 'active' : ''}`}>
                <Clock className="h-4 w-4 mr-2" />
                <span>Queue</span>
              </div>
            </Link>
          </div>
        </nav>

        {/* Admin settings button */}
        <div className="hidden lg:flex items-center ml-4 flex-shrink-0">
          <Link href="/admin">
            <Button 
              variant="ghost" 
              size="sm" 
              className={`glass-card px-3 py-2 ${location.startsWith('/admin') ? 'bg-primary/20 text-primary' : 'hover:bg-card/50'}`}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Mobile navigation */}
        <div className="lg:hidden flex-shrink-0">
          <DropdownMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="glass-card min-h-[44px] min-w-[44px] p-2"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 glass-card mr-2 mt-2 p-2">
              <DropdownMenuItem asChild>
                <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                  <div className={`flex items-center gap-3 w-full py-4 px-3 rounded-lg transition-colors ${location === '/' || location.startsWith('/audio') ? 'text-primary font-medium bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <Plus className="h-5 w-5 flex-shrink-0" />
                    <span className="text-base">Create</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/projects" onClick={() => setMobileMenuOpen(false)}>
                  <div className={`flex items-center gap-3 w-full py-4 px-3 rounded-lg transition-colors ${location.startsWith('/projects') || location.startsWith('/project') ? 'text-primary font-medium bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <FolderClosed className="h-5 w-5 flex-shrink-0" />
                    <span className="text-base">Projects</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/rebuild" onClick={() => setMobileMenuOpen(false)}>
                  <div className={`flex items-center gap-3 w-full py-4 px-3 rounded-lg transition-colors ${location.startsWith('/rebuild') ? 'text-primary font-medium bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <Sparkles className="h-5 w-5 flex-shrink-0" />
                    <span className="text-base">Rebuild</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/library" onClick={() => setMobileMenuOpen(false)}>
                  <div className={`flex items-center gap-3 w-full py-4 px-3 rounded-lg transition-colors ${location.startsWith('/library') ? 'text-primary font-medium bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <Image className="h-5 w-5 flex-shrink-0" />
                    <span className="text-base">Gallery</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/studio" onClick={() => setMobileMenuOpen(false)}>
                  <div className={`flex items-center gap-3 w-full py-4 px-3 rounded-lg transition-colors ${location.startsWith('/studio') ? 'text-primary font-medium bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <Video className="h-5 w-5 flex-shrink-0" />
                    <span className="text-base">Studio</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/queue" onClick={() => setMobileMenuOpen(false)}>
                  <div className={`flex items-center gap-3 w-full py-4 px-3 rounded-lg transition-colors ${location.startsWith('/queue') ? 'text-primary font-medium bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <Clock className="h-5 w-5 flex-shrink-0" />
                    <span className="text-base">Queue</span>
                  </div>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                  <div className={`flex items-center gap-3 w-full py-4 px-3 rounded-lg transition-colors ${location.startsWith('/admin') ? 'text-primary font-medium bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <Settings className="h-5 w-5 flex-shrink-0" />
                    <span className="text-base">Admin</span>
                  </div>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;
