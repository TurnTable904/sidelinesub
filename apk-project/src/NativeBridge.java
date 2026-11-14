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
}
