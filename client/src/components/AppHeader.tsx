import { Navigation, Settings, Ear, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  isListening?: boolean;
  isRecording?: boolean;
}

export default function AppHeader({ isListening = false, isRecording = false }: AppHeaderProps) {
  return (
    <header className="h-16 border-b border-border px-6 flex items-center justify-between bg-background">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
          <Navigation className="w-5 h-5 text-primary-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Journey Assistant</h1>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Listening for wake word indicator */}
        {isListening && !isRecording && (
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Ear className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-medium">Listening for "Hey Journey"...</span>
          </div>
        )}
        
        {/* Recording indicator */}
        {isRecording && (
          <div className="flex items-center gap-2 text-destructive">
            <Mic className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-medium">Recording...</span>
          </div>
        )}
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={() => console.log('Settings clicked')}
        data-testid="button-settings"
      >
        <Settings className="w-5 h-5" />
      </Button>
    </header>
  );
}
