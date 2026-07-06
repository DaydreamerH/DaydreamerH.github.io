add_executable(18_CullFace main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(18_CullFace glfw opengl32)
endif()

foreach(FILE_NAME cull_face.vs cull_face.fs)
    add_custom_command(TARGET 18_CullFace POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:18_CullFace>/${FILE_NAME}"
    )
endforeach()
