package tungtungball.healthmithbackend.cycle;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

public final class CycleProfile {
    private static final ZoneId ZONE=ZoneId.of("Asia/Seoul");
    public static JsonNode calculate(JsonNode input,int days,Instant now,JsonMapper mapper){
        var rows=new ArrayList<JsonNode>();input.forEach(s->{if(s.hasNonNull("ended_at"))rows.add(s);});
        rows.sort(Comparator.comparing(s->Instant.parse(s.path("ended_at").asString())));
        var eligible=rows.stream().filter(s->!s.path("tracking_lost").asBoolean()&&!"pain".equals(s.path("stop_reason").asString())&&!"tracking".equals(s.path("stop_reason").asString())).toList();
        var result=mapper.createObjectNode().put("calculation_version","growth-1").put("sample_count",rows.size()).put("updated_at",now.toString()).put("status",rows.size()<3?"collecting":"ready");
        var axes=result.putArray("axes");Double strength=null,intensity=null,activity=null,recovery=null,endurance=null;
        int promotionCount=0;
        if(!eligible.isEmpty()){
            var last=eligible.get(eligible.size()-1);var lp=last.path("request").path("plan");
            var same=eligible.stream().filter(s->s.path("request").path("plan").path("variant").equals(lp.path("variant"))).toList();
            if(same.size()>=2){double base=peak(same.get(0));if(base>0)strength=50+50*(peak(last)-base)/base;}
            intensity=100.0*lp.path("reps").asDouble()/lp.path("cap").asDouble();
            long complete=eligible.stream().mapToLong(s->{int n=0;for(var c:s.path("counts"))if(c.asInt()>=s.path("request").path("plan").path("reps").asInt())n++;return n;}).sum();
            endurance=100.0*complete/(eligible.size()*5);
            int mature=0,returned=0;
            for(var s:eligible){Instant end=Instant.parse(s.path("ended_at").asString());if(end.plus(Duration.ofDays(7)).isAfter(now))continue;
                boolean hard="hard".equals(s.path("feedback").path("effort").asString())||!"completed".equals(s.path("status").asString());
                if(hard){mature++;if(rows.stream().anyMatch(n->{Instant start=Instant.parse(n.path("started_at").asString());return start.isAfter(end)&&!start.isAfter(end.plus(Duration.ofDays(7)));}))returned++;}}
            if(mature>0)recovery=100.0*returned/mature;
            for(int i=1;i<eligible.size();i++)if("knee".equals(eligible.get(i-1).path("request").path("plan").path("variant").asString())&&"standard".equals(eligible.get(i).path("request").path("plan").path("variant").asString()))promotionCount++;
        }
        var monday=now.atZone(ZONE).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        long dates=rows.stream().filter(s->!"pain".equals(s.path("stop_reason").asString())).filter(s->peak(s)>0).map(s->Instant.parse(s.path("started_at").asString()).atZone(ZONE).toLocalDate()).filter(d->!d.isBefore(monday)&&!d.isAfter(now.atZone(ZONE).toLocalDate())).distinct().count();
        long recent=0,baseline=0;Instant first=null;
        for(var s:rows){Instant t=Instant.parse(s.path("started_at").asString());if(first==null||t.isBefore(first))first=t;if(t.isAfter(now.minus(Duration.ofDays(7))))recent+=s.path("active_ms").asLong();else if(t.isAfter(now.minus(Duration.ofDays(35))))baseline+=s.path("active_ms").asLong();}
        if(first!=null&&!first.isAfter(now.minus(Duration.ofDays(35)))&&baseline>0)activity=50+50*(recent-baseline/4.0)/(baseline/4.0);
        String[] names={"근력","지구력","회복력","꾸준함","활동량","강도"};Double[] values={strength,endurance,recovery,100.0*dates/Math.max(1,days),activity,intensity};
        for(int i=0;i<6;i++){var axis=axes.addObject().put("name",names[i]).put("status",values[i]==null?"insufficient":"available");if(values[i]==null)axis.putNull("value");else axis.put("value",Math.round(Math.min(100,Math.max(0,values[i]))));}
        result.put("period_start",now.minus(Duration.ofDays(35)).toString()).put("recent_active_ms",recent).put("promotions",promotionCount);
        result.put("note","내 기록의 변화예요. 체력 검사나 다른 사람과 비교한 점수가 아니에요. 회복력은 다시 운동에 돌아온 비율이며 강도는 높을수록 좋다는 뜻이 아니에요.");
        return result;
    }
    private static double peak(JsonNode s){int n=0;for(var c:s.path("counts"))n=Math.max(n,c.asInt());return n;}
}
