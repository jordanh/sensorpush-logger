import React, { useState, useRef, useEffect } from "react";
import { gql, useMutation } from "@apollo/client";
import { TableCell } from "@/components/ui/table"; // Use shadcn TableCell
import { Input } from "@/components/ui/input"; // Use shadcn Input
import { Button } from "@/components/ui/button"; // Use shadcn Button
import { Pencil } from "lucide-react"; // Use lucide-react icon
import { cn } from "@/lib/utils"; // Import cn utility

// Define the mutation structure (keep as is)
const UPDATE_SENSOR_NAME = gql`
  mutation UpdateSensorName($spId: Int!, $name: String!) {
    updateSensorName(spId: $spId, name: $name) {
      spId
      friendlyName
    }
  }
`;

interface EditableFriendlyNameCellProps {
  spId: number;
  initialName: string;
}

const EditableFriendlyNameCell: React.FC<EditableFriendlyNameCellProps> = ({
  spId,
  initialName,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentName, setCurrentName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  const [updateName, { loading, error }] = useMutation(UPDATE_SENSOR_NAME, {
    optimisticResponse: {
      updateSensorName: {
        __typename: "Sensor",
        spId: spId,
        friendlyName: currentName,
      },
    },
    onError: (err) => {
      console.error("Error updating sensor name:", err);
      setCurrentName(initialName);
      setIsEditing(false);
    },
    onCompleted: (data) => {
      if (data?.updateSensorName?.friendlyName) {
        setCurrentName(data.updateSensorName.friendlyName);
      }
      setIsEditing(false);
    }
  });

  // Focus input when entering edit mode (keep as is)
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleEditClick = () => {
    // Do not reset currentName here; keep the latest value
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCurrentName(initialName);
  };

  const handleSave = () => {
    if (currentName.trim() === initialName.trim() || currentName.trim() === "") {
      handleCancel();
      return;
    }
    if (!loading) {
        updateName({ variables: { spId: spId, name: currentName.trim() } });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => { // Correct event type for Input
    if (event.key === "Enter") {
      event.preventDefault();
      handleSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
  };

  const handleBlur = () => {
    // Small delay to allow Enter/Escape key press to register before blur potentially cancels
    setTimeout(() => {
        if (isEditing) {
            handleCancel();
        }
    }, 100);
  };


  return (
    // Use group utility on the TableCell for hover effects on children
    <TableCell
      className={cn("relative group", isEditing ? "cursor-default" : "cursor-pointer")}
      onClick={!isEditing ? handleEditClick : undefined}
    >
      {isEditing ? (
        <Input
          ref={inputRef}
          value={currentName}
          onChange={(e) => setCurrentName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          autoFocus
          disabled={loading}
          className="h-8 px-2 py-1 text-sm" // Adjust size to fit cell better
        />
      ) : (
        // Use flexbox to align name and button
        <div className="flex items-center justify-between w-full min-h-[32px]"> {/* Ensure min height */}
          <span className="truncate pr-1">{currentName}</span> {/* Add padding-right */}
          {/* Use shadcn Button for the icon */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200", // Tailwind for hover effect
              loading && "opacity-50 cursor-not-allowed" // Style when loading
            )}
            onClick={(e) => {
                e.stopPropagation(); // Prevent TableCell click handler
                handleEditClick();
            }}
            aria-label="edit friendly name"
            disabled={loading}
          >
            <Pencil className="h-4 w-4" /> {/* Use lucide icon */}
          </Button>
        </div>
      )}
      {/* Optional: Add loading/error indicators if desired using Tailwind */}
      {/* {loading && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Saving...</span>} */}
      {/* {error && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-destructive">Error</span>} */}
    </TableCell>
  );
};

export default EditableFriendlyNameCell;