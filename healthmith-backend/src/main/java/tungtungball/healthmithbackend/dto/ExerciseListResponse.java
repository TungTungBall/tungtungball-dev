package tungtungball.healthmithbackend.dto;

import java.util.List;

public record ExerciseListResponse(List<Exercise> items) {
    public record Exercise(String id, String name, List<String> bodyParts, String internalFocusInstruction) {
    }
}
