#version 330 core
out vec4 FragColor;

in vec2 TexCoords;

uniform sampler2D hdrBuffer;
uniform bool hdr;
uniform float exposure;

void main()
{
    const float gamma = 2.2f;
    vec3 result = texture(hdrBuffer, TexCoords).rgb;
    
    if (hdr)
    {
        result = vec3(1.f) - exp(-result * exposure);
    }
    
    result = pow(result, vec3(1.f / gamma));
    FragColor = vec4(result,1.f);
}