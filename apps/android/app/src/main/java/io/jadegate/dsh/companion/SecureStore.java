package io.jadegate.dsh.companion;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureStore {
 private static final String ALIAS = "dsh-paired-device-v1";
 private final Context context;
 SecureStore(Context context) { this.context = context; }
 private SecretKey key() throws Exception {
  KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
  if (!store.containsAlias(ALIAS)) {
   KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
   generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
   return generator.generateKey();
  }
  return (SecretKey) store.getKey(ALIAS, null);
 }
 void save(String value) throws Exception {
  Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
  String stored = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
  if (!context.getSharedPreferences("connection", Context.MODE_PRIVATE).edit().putString("sealed", stored).commit()) throw new Exception("无法保存设备授权");
 }
 String read() throws Exception {
  String value = context.getSharedPreferences("connection", Context.MODE_PRIVATE).getString("sealed", null);
  if (value == null) return null;
  String[] fields = value.split("\\.", 2);
  Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
  cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(fields[0], Base64.NO_WRAP)));
  return new String(cipher.doFinal(Base64.decode(fields[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8);
 }
 void clear() { context.getSharedPreferences("connection", Context.MODE_PRIVATE).edit().clear().commit(); }
}
