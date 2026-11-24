package tungtungball.healthmithbackend.cycle;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class FeedbackKeywordsTest {
 @Test void representativeCommentsRequireExplicitConfirmation(){
   String[][] cases={{"다리 운동 하고 싶어요","prefer_legs"},{"하체 위주로","prefer_legs"},{"팔 운동 원해요","prefer_arms"},{"복근 하고 싶어요","prefer_core"},{"코어 중심으로","prefer_core"},{"어깨를 운동하고 싶어요","prefer_shoulder"},{"가슴 운동","prefer_chest"},{"목 운동","prefer_neck"},{"다리는 싫어요","avoid_legs"},{"팔 말고","avoid_arms"},{"어깨 빼주세요","avoid_shoulder"},{"가슴은 제외","avoid_chest"},{"목은 안 하고 싶어요","avoid_neck"},{"복근은 원하지 않아요","avoid_core"},{"너무 지루해요","variety"},{"똑같은 것만 해요","variety"},{"다른 운동 원해요","variety"},{"같은 운동 계속","same_exercise"},{"쉬는 시간이 짧아요","more_rest"},{"쉬는 시간 길어요","less_rest"},{"휴식을 늘려요","more_rest"},{"휴식을 줄여요","less_rest"},{"좋았어요",""},{"고마워요",""},{"손목 통증 있어요",""},{"다리가 아파요",""},{"팔이 저려요",""},{"다리는 싫어요, 팔은 원해요","avoid_legs,prefer_arms"},{"무릎 아프고 다리 운동 해줘",""},{"가슴 운동, 그리고 숨차요","prefer_chest,more_rest"}};
   for(var row:cases){var got=FeedbackKeywords.extract(row[0]);assertEquals(row[1].isEmpty()?Set.of():Set.of(row[1].split(",")),new HashSet<>(got.keywords()),row[0]);}
 }
 @Test void painIsSeparateAndConflictingDirectionsAreNotGuessed(){assertTrue(FeedbackKeywords.extract("손목이 아파요").pain());assertTrue(FeedbackKeywords.extract("더 쉬고 싶어요, 덜 쉬고 싶어요").keywords().isEmpty());}
}
