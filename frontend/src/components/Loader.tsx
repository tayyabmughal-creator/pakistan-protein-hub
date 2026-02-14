import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  className?: string;
  size?: number | string;
}

const Loader = ({ className, size = 24 }: LoaderProps) => {
  return (
    <div className="flex items-center justify-center p-4">
      <Loader2
        className={cn("animate-spin text-primary", className)}
        size={size}
      />
    </div>
  );
};

export default Loader;