package com.sidelinesub.team;
import android.app.Activity;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.*;
import java.nio.charset.StandardCharsets;
public class MainActivity extends Activity implements Runnable {
  public void run(){ load(); }
  static final int BUILD = 37;
  private WebView web;
  File bundleFile(){ return new File(getFilesDir(), "bundle.html"); }
  File verFile(){ return new File(getFilesDir(), "bundle.v"); }
  int bundleVersion(){ try{ return Integer.parseInt(readFile(verFile()).trim()); }catch(Exception e){ return 0; } }
  String readFile(File f) throws IOException { byte[] b=new byte[(int)f.length()]; try(FileInputStream in=new FileInputStream(f)){ int o=0,n; while(o<b.length&&(n=in.read(b,o,b.length-o))>0) o+=n; } return new String(b,StandardCharsets.UTF_8); }
  void writeFile(File f,String s) throws IOException { File t=new File(f.getPath()+".tmp"); try(FileOutputStream out=new FileOutputStream(t)){ out.write(s.getBytes(StandardCharsets.UTF_8)); } if(!t.renameTo(f)) throw new IOException("rename"); }
  void load(){
    int bv=bundleVersion();
    if(bv>BUILD && bundleFile().exists()){
      try{ String html=readFile(bundleFile());
        html="<script>window.BB_FROM_BUNDLE="+bv+";</script>"+html;
        web.loadDataWithBaseURL("file:///android_asset/index.html", html, "text/html", "utf-8", null); return; }
      catch(Exception e){ bundleFile().delete(); verFile().delete(); }
    }
    web.loadUrl("file:///android_asset/index.html");
  }
  @Override protected void onCreate(Bundle b){
    super.onCreate(b);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    web=new WebView(this);
    WebSettings s=web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(true);
    s.setAllowUniversalAccessFromFileURLs(true);
    s.setAllowFileAccessFromFileURLs(true);
    s.setTextZoom(100);
    s.setUseWideViewPort(true);
    s.setLoadWithOverviewMode(true);
    web.setWebViewClient(new WebViewClient());
    web.addJavascriptInterface(new NativeBridge(this), "BBNative");
    web.setBackgroundColor(0xFFFFFFFF);
    setContentView(web);
    load();
  }
  @Override public void onBackPressed(){ moveTaskToBack(true); }
}
