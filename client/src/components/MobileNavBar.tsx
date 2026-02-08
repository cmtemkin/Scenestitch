import { Link, useLocation } from 'wouter';
import { Plus, FolderClosed, Image, Clock, Sparkles } from 'lucide-react';

const MobileNavBar = () => {
  const [location] = useLocation();
  
  const navItems = [
    { href: '/', icon: Plus, label: 'Create', isActive: location === '/' || location.startsWith('/create') },
    { href: '/projects', icon: FolderClosed, label: 'Projects', isActive: location.startsWith('/projects') || location.startsWith('/project') },
    { href: '/library', icon: Image, label: 'Gallery', isActive: location.startsWith('/library') },
    { href: '/queue', icon: Clock, label: 'Queue', isActive: location.startsWith('/queue') },
    { href: '/rebuild', icon: Sparkles, label: 'Rebuild', isActive: location.startsWith('/rebuild') },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div 
              className={`flex flex-col items-center justify-center min-w-[64px] py-2 px-3 rounded-xl transition-all duration-200 ${
                item.isActive 
                  ? 'text-primary bg-primary/10' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <item.icon className={`h-5 w-5 ${item.isActive ? 'scale-110' : ''} transition-transform`} />
              <span className={`text-[10px] mt-1 font-medium ${item.isActive ? 'text-primary' : ''}`}>
                {item.label}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default MobileNavBar;
