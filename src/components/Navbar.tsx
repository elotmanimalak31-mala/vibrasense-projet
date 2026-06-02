import { Activity, BarChart3, Cpu, History, Home, LogOut, Settings, User as UserIcon } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const links = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/dashboard", label: "Temps Réel", icon: Activity },
  { to: "/history", label: "Historique", icon: History },
  { to: "/analysis", label: "Analyse", icon: BarChart3 },
  { to: "/esp32", label: "ESP32", icon: Cpu },
  { to: "/settings", label: "Paramètres", icon: Settings },
];

export const Navbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    toast.success("Déconnecté");
    navigate("/login", { replace: true });
  };

  const initial = (user?.user_metadata?.display_name || user?.email || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <span className="font-bold tracking-tight">VibraSense</span>
        </NavLink>

        <nav className="flex items-center gap-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}

          <div className="ml-2 pl-2 border-l border-border/60">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 border border-primary/30 text-xs font-bold text-primary">
                      {initial}
                    </span>
                    <span className="hidden md:inline text-sm max-w-[140px] truncate">
                      {user.user_metadata?.display_name || user.email}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {user.user_metadata?.display_name || "Utilisateur"}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Se déconnecter
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" variant="default" className="gap-1.5">
                <NavLink to="/login">
                  <UserIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Connexion</span>
                </NavLink>
              </Button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};
