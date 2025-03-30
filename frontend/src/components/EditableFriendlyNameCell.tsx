import React, { useState, useRef, useEffect } from "react";
import { gql, useMutation } from "@apollo/client";
import { TableCell, TextField, IconButton, Box } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit"; // Import the Edit icon

// Define the mutation structure based on the .graphql file
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
  const [isHovering, setIsHovering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [updateName, { loading, error }] = useMutation(UPDATE_SENSOR_NAME, {
    // Optimistic update (optional but good UX)
    optimisticResponse: {
      updateSensorName: {
        __typename: "Sensor", // Ensure typename matches schema if using cache normalization extensively
        spId: spId,
        friendlyName: currentName,
      },
    },
    // You might need explicit cache updates if optimisticResponse isn't enough
    // or if your cache isn't normalized perfectly by spId.
    // update(cache, { data: { updateSensorName } }) {
    //   // Manual cache update logic here if needed
    // }
    onError: (err) => {
      console.error("Error updating sensor name:", err);
      // Revert optimistic update on error
      setCurrentName(initialName); // Or fetch the latest name again
      setIsEditing(false); // Exit editing mode on error
    },
    onCompleted: (data) => {
      // Update local state with the confirmed name from the server
      // This handles cases where the server might modify the name (e.g., trimming)
      if (data?.updateSensorName?.friendlyName) {
        setCurrentName(data.updateSensorName.friendlyName);
      }
      setIsEditing(false); // Exit editing mode on success
    }
  });

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Select text for easier editing
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleEditClick = () => {
    setCurrentName(initialName); // Reset to initial name when starting edit
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setCurrentName(initialName); // Revert to the name before editing started
  };

  const handleSave = () => {
    // Prevent saving if the name hasn't changed or is empty
    if (currentName.trim() === initialName.trim() || currentName.trim() === "") {
      handleCancel(); // Just cancel if no change or empty
      return;
    }
    if (!loading) {
        updateName({ variables: { spId: spId, name: currentName.trim() } });
        // setIsEditing(false); // Set by onCompleted/onError now
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
  };

  const handleBlur = () => {
    // Small delay to allow Enter key press to register before blur potentially cancels
    setTimeout(() => {
        // Check if we are still in editing mode.
        // If Enter was pressed, onCompleted/onError would have set isEditing to false.
        if (isEditing) {
            handleCancel();
        }
    }, 100); // Adjust delay if needed
  };


  return (
    <TableCell
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={!isEditing ? handleEditClick : undefined} // Only allow click to edit when not already editing
      sx={{ position: "relative", cursor: isEditing ? "default" : "pointer" }}
    >
      {isEditing ? (
        <TextField
          inputRef={inputRef}
          value={currentName}
          onChange={(e) => setCurrentName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          variant="standard" // Use standard variant for less visual clutter
          size="small"
          fullWidth
          autoFocus // Helps ensure focus on initial render in edit mode
          sx={{
            // Remove extra padding/margin to fit better in the cell
            padding: 0,
            margin: 0,
            '& .MuiInputBase-root': {
                marginTop: 0, // Adjust if needed based on TableCell padding
            },
          }}
          disabled={loading} // Disable input while saving
        />
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>{currentName}</span>
          <IconButton
            size="small"
            onClick={(e) => {
                e.stopPropagation(); // Prevent TableCell click handler
                handleEditClick();
            }}
            sx={{
              visibility: isHovering ? "visible" : "hidden",
              opacity: isHovering ? 1 : 0,
              transition: "opacity 0.2s ease-in-out, visibility 0.2s ease-in-out",
              padding: '2px' // Reduce padding
            }}
            aria-label="edit friendly name"
          >
            <EditIcon fontSize="inherit" />
          </IconButton>
        </Box>
      )}
      {/* Optional: Add loading indicator */}
      {/* {loading &amp;&amp; <CircularProgress size={16} sx={{ position: 'absolute', right: 5, top: '50%', marginTop: '-8px' }} />} */}
      {/* Optional: Add error indicator */}
      {/* {error &amp;&amp; <Tooltip title={error.message}><ErrorOutlineIcon color="error" sx={{ position: 'absolute', right: 5, top: '50%', marginTop: '-8px' }} /></Tooltip>} */}
    </TableCell>
  );
};

export default EditableFriendlyNameCell;