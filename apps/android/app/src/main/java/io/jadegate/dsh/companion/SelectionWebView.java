package io.jadegate.dsh.companion;

import android.content.Context;
import android.graphics.Rect;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.webkit.WebView;
import android.widget.Toast;
import java.nio.charset.StandardCharsets;

/** Capture the page selection before Android dismisses its floating selection menu. */
final class SelectionWebView extends WebView {
 private static final int ANNOTATE=0x445348;
 SelectionWebView(Context context){super(context);}
 void installSelection(){
  try(java.io.InputStream source=getContext().getAssets().open("chat/native-selection.js")){
   java.io.ByteArrayOutputStream body=new java.io.ByteArrayOutputStream();byte[] block=new byte[4096];int count;
   while((count=source.read(block))!=-1){if(body.size()+count>32768)throw new java.io.IOException("Selection helper too large");body.write(block,0,count);}
   evaluateJavascript(body.toString(StandardCharsets.UTF_8.name()),null);
  }catch(java.io.IOException unavailable){Toast.makeText(getContext(),"批注菜单加载失败，请重新打开当前对话",Toast.LENGTH_SHORT).show();}
 }
 @Override public ActionMode startActionMode(ActionMode.Callback callback){return super.startActionMode(wrap(callback));}
 @Override public ActionMode startActionMode(ActionMode.Callback callback,int type){return super.startActionMode(wrap(callback),type);}
 private ActionMode.Callback wrap(ActionMode.Callback original){return new ActionMode.Callback2(){
  private void add(Menu menu){if(menu.findItem(ANNOTATE)==null)menu.add(Menu.NONE,ANNOTATE,0,"添加批注").setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);}
  @Override public boolean onCreateActionMode(ActionMode mode,Menu menu){boolean created=original.onCreateActionMode(mode,menu);if(created)add(menu);return created;}
  @Override public boolean onPrepareActionMode(ActionMode mode,Menu menu){boolean changed=original.onPrepareActionMode(mode,menu);add(menu);return changed;}
  @Override public boolean onActionItemClicked(ActionMode mode,MenuItem item){
   if(item.getItemId()!=ANNOTATE)return original.onActionItemClicked(mode,item);
   evaluateJavascript("window.dshNativeAnnotate ? window.dshNativeAnnotate() : false",result->{
    if(!"true".equals(result))Toast.makeText(getContext(),"请先长按选中对话或文件正文",Toast.LENGTH_SHORT).show();
    mode.finish();
   });return true;
  }
  @Override public void onDestroyActionMode(ActionMode mode){original.onDestroyActionMode(mode);}
  @Override public void onGetContentRect(ActionMode mode,View view,Rect rect){if(original instanceof ActionMode.Callback2)((ActionMode.Callback2)original).onGetContentRect(mode,view,rect);else super.onGetContentRect(mode,view,rect);}
 };}
}
