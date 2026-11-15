package com.sidelinesub.team;
import android.webkit.JavascriptInterface;
public class NativeBridge {
  private final MainActivity act;
  public NativeBridge(MainActivity a){ act=a; }
  @JavascriptInterface public int build(){ return MainActivity.BUILD; }
  @JavascriptInterface public int bundle(){ return act.bundleVersion(); }
  @JavascriptInterface public boolean save(int v,String html){ try{ act.writeFile(act.bundleFile(),html); act.writeFile(act.verFile(),String.valueOf(v)); return true; }catch(Exception e){ return false; } }
  @JavascriptInterface public void clear(){ act.bundleFile().delete(); act.verFile().delete(); }
  @JavascriptInterface public void restart(){ act.runOnUiThread(act); }
  @JavascriptInterface public void notify(String title, String body){
    final String t=title==null?"Sideline Sub":title, b=body==null?"":body;
    act.runOnUiThread(() -> SubAlertService.alertNow(act, t, b));
  }
  @JavascriptInterface public void vibrate(double ms){
    final int n=(int)Math.max(1, Math.min(2000, ms));
    act.runOnUiThread(() -> act.vibrateMs(n));
  }
  @JavascriptInterface public void startGameService(double dueAtMs, double leadMs){
    act.runOnUiThread(() -> act.scheduleAlerts((long)dueAtMs, (long)leadMs));
  }
  @JavascriptInterface public void stopGameService(){ act.runOnUiThread(() -> act.cancelAlerts()); }
}
