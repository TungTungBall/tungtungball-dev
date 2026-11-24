package tungtungball.healthmithbackend.cycle;
import java.util.*;
import java.util.regex.Pattern;

/** 원문은 이 규칙에서만 읽는다. 결과는 사용자가 확인한 뒤 저장한다. */
public final class FeedbackKeywords {
    public record Preview(List<String> keywords, boolean pain, String dictionaryVersion) {}
    private static final Pattern PAIN=Pattern.compile("아프|아파|아픈|통증|시큰|저림|저려|결림|결려|다쳤|부상");
    public static Preview extract(String comment) {
        var result=new LinkedHashSet<String>();boolean pain=false;
        for(String clause:comment.split("[.!?\\n,]|그리고|하지만|그런데")) {
            if(PAIN.matcher(clause).find()){pain=true;continue;}
            var parts=new LinkedHashMap<String,String>();parts.put("arms","팔");parts.put("legs","다리|하체");parts.put("core","복근|코어");parts.put("shoulder","어깨");parts.put("chest","가슴");parts.put("neck","목");
            parts.forEach((code,words)->{
                if(Pattern.compile(words).matcher(clause).find()) {
                    boolean negative=Pattern.compile("(?:"+words+")(?:은|는|이|가|을|를|도)?\\s*(?:싫|말고|빼|제외|안\\s*하|원하지)").matcher(clause).find();
                    result.add((negative?"avoid_":"prefer_")+code);
                }
            });
            if(clause.matches(".*(지루|똑같|다른 운동|다양).*"))result.add("variety");
            if(clause.matches(".*(같은 운동 계속|같은 운동 유지).*"))result.add("same_exercise");
            if(clause.matches(".*(숨차|더 쉬|휴식.*(늘|더|길)|쉬는 시간.*(짧|부족|늘)).*"))result.add("more_rest");
            if(clause.matches(".*(덜 쉬|휴식.*(줄|덜|짧)|쉬는 시간.*(길|줄)).*"))result.add("less_rest");
        }
        if(result.contains("more_rest")&&result.contains("less_rest")){result.remove("more_rest");result.remove("less_rest");}
        for(String part:List.of("arms","legs","core","shoulder","chest","neck"))if(result.contains("avoid_"+part))result.remove("prefer_"+part);
        return new Preview(List.copyOf(result),pain,"ko-rules-1");
    }
}
